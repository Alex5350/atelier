import { eq } from "drizzle-orm";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { resolveLanguageModel, RegistryError } from "@/lib/models/server";
import {
  createConversation,
  getConversation,
  saveMessage,
  titleFromParts,
  touchConversation,
} from "@/lib/chat/queries";
import { headers } from "next/headers";

export const maxDuration = 60;

/**
 * The chat endpoint: auth, model resolution from the registry (per turn, so a
 * model switch mid-conversation just works), the streaming response, and
 * lossless persistence of the turn on completion. Registry failures return
 * typed, user-presentable states instead of a 500.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    messages: UIMessage[];
    conversationId?: string;
    modelId?: string;
  };

  const registryId = body.modelId ?? "mock/atelier-muse";
  const [modelRow] = await db.select().from(schema.models).where(eq(schema.models.id, registryId)).limit(1);
  if (!modelRow) {
    return Response.json({ error: "unknown-model", modelId: registryId }, { status: 400 });
  }

  let languageModel;
  try {
    languageModel = resolveLanguageModel({
      id: modelRow.id,
      displayName: modelRow.displayName,
      provider: modelRow.provider,
      modality: modelRow.modality,
      modelName: modelRow.modelName,
      capabilities: (modelRow.capabilities as string[]) ?? [],
      contextWindow: modelRow.contextWindow,
      enabled: modelRow.enabled,
      isMock: modelRow.isMock,
    });
  } catch (error) {
    if (error instanceof RegistryError) {
      return Response.json(
        { error: error.code, message: error.message, modelId: registryId },
        { status: error.code === "needs-key" ? 409 : 400 },
      );
    }
    throw error;
  }

  // Resolve or create the conversation before streaming anything. The client
  // sends "pending" for a brand-new chat; the created id rides back on every
  // message's metadata so the page can adopt the shareable URL without a
  // reload, and every later turn reuses the same conversation.
  let conversationId = body.conversationId;
  if (conversationId && conversationId !== "pending") {
    const existing = await getConversation(session.user.id, conversationId);
    if (!existing) {
      return Response.json({ error: "unknown-conversation" }, { status: 404 });
    }
  } else {
    const created = await createConversation(session.user.id);
    conversationId = created.id;
  }

  // Persist the incoming user turn. Idempotent by message id: regenerations
  // resend history whose user turns are already stored, and re-saving is a
  // no-op.
  const last = body.messages.at(-1);
  if (last && last.role === "user") {
    await saveMessage({
      id: last.id,
      conversationId,
      role: "user",
      parts: last.parts,
      modelId: null,
    });
    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1);
    if (conversation?.title === "New conversation") {
      const title = titleFromParts(last.parts);
      if (title) {
        await touchConversation(conversationId, title);
      }
    }
  }

  const result = streamText({
    model: languageModel,
    messages: await convertToModelMessages(body.messages),
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: () => ({ modelId: registryId, demo: modelRow.isMock, conversationId }),
    onFinish: async ({ messages }) => {
      // On abort this is the partial message: history should show exactly
      // what streamed, no more.
      const assistant = messages.at(-1);
      if (assistant && assistant.role === "assistant") {
        await saveMessage({
          id: assistant.id,
          conversationId,
          role: "assistant",
          parts: assistant.parts,
          modelId: registryId,
        });
      }
      await touchConversation(conversationId);
    },
  });
}
