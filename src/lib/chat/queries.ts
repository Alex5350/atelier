import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Chat persistence. Messages store AI SDK UIMessage parts losslessly (JSONB),
 * so history replays exactly what streamed: markdown, metadata, and later
 * file and citation parts ride the same column.
 */

export async function listConversations(userId: string) {
  return db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(100);
}

export async function createConversation(userId: string, title = "New conversation") {
  const id = crypto.randomUUID();
  await db.insert(schema.conversations).values({ id, userId, title });
  return { id, title };
}

export async function getConversation(userId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listMessages(conversationId: string) {
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(schema.messages.createdAt);
}

/** Persists one message; idempotent by message id (client retries are safe). */
export async function saveMessage(input: {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  parts: unknown[];
  modelId: string | null;
}) {
  await db
    .insert(schema.messages)
    .values({
      id: input.id,
      conversationId: input.conversationId,
      role: input.role,
      parts: input.parts,
      modelId: input.modelId,
    })
    .onConflictDoNothing();
}

export async function touchConversation(conversationId: string, title?: string) {
  await db
    .update(schema.conversations)
    .set(title ? { updatedAt: new Date(), title } : { updatedAt: new Date() })
    .where(eq(schema.conversations.id, conversationId));
}

/** Derives a conversation title from the first user turn's text. */
export function titleFromParts(parts: unknown[]): string | null {
  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: string }).type === "text" &&
      typeof (part as { text?: string }).text === "string"
    ) {
      const text = (part as { text: string }).text.trim();
      if (text.length > 0) {
        const cut = text.slice(0, 60);
        return cut.length < text.length ? cut + "..." : cut;
      }
    }
  }
  return null;
}
