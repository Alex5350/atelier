import type { UIMessage } from "ai";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getConversation, listMessages } from "@/lib/chat/queries";

export const PAGE_SIZE = 50;

/**
 * Earlier pages of a conversation, newest-window-first loading: the client
 * passes the createdAt of its oldest message as the `before` cursor and gets
 * the next-older page plus whether another one exists.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { conversationId } = await context.params;
  const conversation = await getConversation(session.user.id, conversationId);
  if (!conversation) {
    return Response.json({ error: "unknown-conversation" }, { status: 404 });
  }

  const beforeParam = new URL(request.url).searchParams.get("before");
  let before: Date | undefined;
  if (beforeParam) {
    const parsed = new Date(beforeParam);
    if (Number.isNaN(parsed.getTime())) {
      return Response.json({ error: "invalid-before" }, { status: 400 });
    }
    before = parsed;
  }

  const rows = await listMessages(conversationId, { before, limit: PAGE_SIZE });
  const messages: UIMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: (row.parts as UIMessage["parts"]) ?? [],
    metadata: {
      modelId: row.modelId ?? undefined,
      at: row.createdAt.toISOString(),
    },
  }));
  return Response.json({ messages, hasMore: rows.length === PAGE_SIZE });
}
