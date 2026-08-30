import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet } from "lucide-react";

export const metadata: Metadata = { title: "Usage" };

export default function UsagePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Card className="border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <Wallet className="size-4 text-primary" aria-hidden /> Usage
          </CardTitle>
          <CardDescription>Spend by day, model, conversation, and project lands with the ledger in phase 4.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-8 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
}
