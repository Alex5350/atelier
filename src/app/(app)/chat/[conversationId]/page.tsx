import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { requireSession } from "@/lib/session";
import { getConversation, listMessages } from "@/lib/chat/queries";
import { chatModelChoices } from "@/lib/models/registry";
import { liveProviderStatuses } from "@/lib/models/server";
import { ChatView } from "@/components/chat/chat-view";
import { db } from "@/db";
import { schema } from "@/db";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await requireSession();
  const { conversationId } = await params;

  // "new" is the local alias for a conversation that does not exist yet; the
  // chat route creates the row on the first turn and the client keeps using
  // this page's state without a navigation.
  const isNew = conversationId === "new";
  const conversation = isNew ? null : await getConversation(session.user.id, conversationId);
  if (!isNew && !conversation) {
    notFound();
  }

  const stored = isNew ? [] : await listMessages(conversationId);
  const initialMessages: UIMessage[] = isNew
    ? []
    : stored.map((row) => ({
        id: row.id,
        role: row.role as UIMessage["role"],
        parts: (row.parts as UIMessage["parts"]) ?? [],
        metadata: row.modelId ? { modelId: row.modelId } : undefined,
      }));

  const modelRows = await db.select().from(schema.models);
  const models = chatModelChoices(
    modelRows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      provider: row.provider,
      modality: row.modality,
      modelName: row.modelName,
      capabilities: (row.capabilities as string[]) ?? [],
      contextWindow: row.contextWindow,
      enabled: row.enabled,
      isMock: row.isMock,
    })),
    liveProviderStatuses(),
  );

  if (models.length === 0) {
    return (
      <div className="mx-auto max-w-3xl pt-16 text-center text-sm text-muted-foreground">
        No text models are enabled. Enable one in Admin (the demo model needs no keys).
      </div>
    );
  }

  return (
    <ChatView
      conversationId={isNew ? "pending" : conversationId}
      initialMessages={initialMessages}
      models={models}
    />
  );
}
