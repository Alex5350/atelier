import { and, eq } from "drizzle-orm";
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
import { approxTokens, budgetDecision, estimateTextCostUsd } from "@/lib/usage/core";
import { budgetCapUsd, spendTodayUsd, writeUsageEvent } from "@/lib/usage/queries";
import type { PriceRow } from "@/lib/models/registry";
import type { ModelMessage } from "ai";
import { buildFileContextBlock } from "@/lib/files/extract";
import { inlineLocalFileParts } from "@/lib/chat/file-parts";
import { storage } from "@/lib/storage";

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
    attachments?: string[];
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

  // Load this turn's attachments (owner-scoped): documents become a labeled
  // context block; images ride the message as file parts the loader below
  // inlines for real providers.
  const attachmentRows = body.attachments?.length
    ? await db
        .select()
        .from(schema.files)
        .where(eq(schema.files.userId, session.user.id))
        .then((rows) => rows.filter((row) => body.attachments!.includes(row.id)))
    : [];
  const fileContext = buildFileContextBlock(
    attachmentRows.filter((row) => row.kind === "document"),
    12_000,
  );

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
    // Attachment rows reference the message, so the message lands first.
    for (const file of attachmentRows) {
      await db
        .insert(schema.attachments)
        .values({
          id: crypto.randomUUID(),
          messageId: last.id,
          conversationId,
          fileId: file.id,
          mode: "context",
        })
        .onConflictDoNothing();
    }
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

  // Budget gate before any provider work: today's ledger spend plus a
  // conservative estimate for this turn must fit under the daily cap. The
  // refusal is a typed state the client presents, not an opaque error, and it
  // happens before a single token is billed.
  const prices: PriceRow[] = (
    await db.select().from(schema.modelPrices).where(eq(schema.modelPrices.modelId, registryId))
  ).map((row) => ({
    modelId: row.modelId,
    effectiveFrom: row.effectiveFrom,
    inputPerMtok: row.inputPerMtok,
    outputPerMtok: row.outputPerMtok,
    perImage: row.perImage,
    perVideoSecond: row.perVideoSecond,
  }));
  const promptTokens = approxTokens(JSON.stringify(body.messages));
  const decision = budgetDecision(
    await spendTodayUsd(session.user.id),
    await budgetCapUsd(session.user.id),
    estimateTextCostUsd(prices, new Date(), promptTokens, 1024),
  );
  if (!decision.allowed) {
    return Response.json(
      {
        error: "budget-exceeded",
        message:
          `Daily budget: $${decision.spentUsd.toFixed(2)} spent of the $${decision.capUsd.toFixed(2)} cap, ` +
          `and this turn estimates $${decision.estimateUsd.toFixed(4)}. The cap resets at midnight UTC; ` +
          "adjust it on the Usage page.",
      },
      { status: 402 },
    );
  }

  const loader = async (id: string) => {
    const [file] = await db
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.id, id), eq(schema.files.userId, session.user.id)))
      .limit(1);
    if (!file) {
      return null;
    }
    try {
      const blob = await storage.get(file.storageKey);
      return { mime: file.mime, bytes: new Uint8Array(blob.bytes) };
    } catch {
      return null;
    }
  };

  let modelMessages: ModelMessage[] = await convertToModelMessages(body.messages);
  modelMessages = await inlineLocalFileParts(modelMessages, loader);

  const result = streamText({
    model: languageModel,
    messages: modelMessages,
    system: fileContext ?? undefined,
    onFinish: async ({ totalUsage }) => {
      // The ledger write: usage as the provider reported it, cost estimated
      // from the price row in effect right now (pinned by the write).
      await writeUsageEvent({
        userId: session.user.id,
        modelId: registryId,
        kind: "text",
        inputTokens: totalUsage.inputTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
        conversationId,
      });
    },
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
