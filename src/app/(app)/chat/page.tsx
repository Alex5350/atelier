import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessagesSquare } from "lucide-react";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Card className="border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <MessagesSquare className="size-4 text-primary" aria-hidden /> Chat
          </CardTitle>
          <CardDescription>Streaming conversations with files and citations arrive next in this wave.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-8 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
}
