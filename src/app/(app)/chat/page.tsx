import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listConversations } from "@/lib/chat/queries";
import { MotionStagger, MotionItem } from "@/components/app/motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessagesSquare, Plus, Sparkles } from "lucide-react";
import { db } from "@/db";
import { schema } from "@/db";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage() {
  const session = await requireSession();
  const conversations = await listConversations(session.user.id);
  const [muse] = await db
    .select()
    .from(schema.models)
    .where(eq(schema.models.id, "mock/atelier-muse"))
    .limit(1);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MotionStagger className="space-y-2">
        <MotionItem>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Chat</h1>
        </MotionItem>
        <MotionItem>
          <p className="text-sm text-muted-foreground">
            Streaming conversations with any available model; the picker never offers what the
            registry would refuse.{" "}
            {muse?.enabled
              ? "With no provider keys, Atelier Muse keeps the surface fully demonstrable."
              : ""}
          </p>
        </MotionItem>
      </MotionStagger>

      <MotionStagger className="grid gap-4 md:grid-cols-3">
        <MotionItem className="md:col-span-1">
          <Card className="h-full border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading">
                <Plus className="size-4 text-primary" aria-hidden /> New conversation
              </CardTitle>
              <CardDescription>
                Pick a model on the first turn; switch it any time, even mid-conversation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button render={<Link href="/chat/new" />} variant="outline" size="sm">
                Start one
              </Button>
            </CardContent>
          </Card>
        </MotionItem>
        <MotionItem className="md:col-span-2">
          <Card className="h-full border-border/60 bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading">
                <MessagesSquare className="size-4 text-primary" aria-hidden /> Recent
              </CardTitle>
              <CardDescription>
                {conversations.length === 0 ? "Nothing yet." : `${conversations.length} conversations`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {conversations.slice(0, 8).map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/chat/${conversation.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <span className="truncate">{conversation.title}</span>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {conversation.updatedAt.toLocaleDateString()}
                  </span>
                </Link>
              ))}
              {conversations.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                  <Sparkles className="size-3.5" aria-hidden />
                  Every conversation starts with a single prompt.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </MotionItem>
      </MotionStagger>
    </div>
  );
}
