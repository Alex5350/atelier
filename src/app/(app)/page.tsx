import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { MotionStagger, MotionItem } from "@/components/app/motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessagesSquare, Images, Wallet, ArrowRight, Sparkles } from "lucide-react";
import { sql } from "drizzle-orm";

export default async function DashboardPage() {
  const session = await requireSession();

  // Live counts from the registry foundations; the surfaces fill in over wave 1.
  const [{ modelCount }] = await db
    .select({ modelCount: sql<number>`count(*)::int` })
    .from(schema.models);
  const [{ spendToday }] = await db
    .select({ spendToday: sql<string>`coalesce(sum(${schema.usageEvents.cost}), 0)::text` })
    .from(schema.usageEvents)
    .where(sql`${schema.usageEvents.userId} = ${session.user.id} and ${schema.usageEvents.createdAt} >= date_trunc('day', now())`);
  const [budget] = await db
    .select()
    .from(schema.budgetSettings)
    .where(sql`${schema.budgetSettings.userId} = ${session.user.id}`);

  const stats = [
    { label: "Models registered", value: String(modelCount), hint: "Admin adds more without deploys", icon: Sparkles },
    { label: "Spend today", value: `$${Number(spendToday).toFixed(4)}`, hint: "Every call lands in the ledger", icon: Wallet },
    { label: "Daily budget", value: budget ? `$${Number(budget.dailyCapUsd).toFixed(2)}` : "$5.00", hint: "Enforced before each provider call", icon: Wallet },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <MotionStagger className="space-y-2">
        <MotionItem>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Welcome back, {session.user.name.split(" ")[0]}
          </h1>
        </MotionItem>
        <MotionItem>
          <p className="text-muted-foreground">
            Chat with your files, iterate images through passes with review gates, and see exactly
            what every model call costs.
          </p>
        </MotionItem>
      </MotionStagger>

      <MotionStagger className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <MotionItem key={stat.label}>
            <Card className="border-border/60 bg-card/60">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <stat.icon className="size-3.5" aria-hidden />
                  {stat.label}
                </CardDescription>
                <CardTitle className="font-heading text-2xl tabular-nums">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{stat.hint}</CardContent>
            </Card>
          </MotionItem>
        ))}
      </MotionStagger>

      <MotionStagger className="grid gap-4 md:grid-cols-2">
        <MotionItem>
          <Card className="group border-border/60 bg-card/60 transition-colors hover:border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading">
                <MessagesSquare className="size-4 text-primary" aria-hidden /> Chat
              </CardTitle>
              <CardDescription>
                Streaming conversations with any registered model. Attach files as context or index
                them for retrieval with citations. Arrives next in this wave.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" disabled>
                Coming next <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </CardContent>
          </Card>
        </MotionItem>
        <MotionItem>
          <Card className="group border-border/60 bg-card/60 transition-colors hover:border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-heading">
                <Images className="size-4 text-primary" aria-hidden /> Studio
              </CardTitle>
              <CardDescription>
                Projects of passes: prompt, references, batches. Approved assets only feed the next
                pass, with a lineage graph of how everything was made.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" disabled>
                Wave 3 <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </CardContent>
          </Card>
        </MotionItem>
      </MotionStagger>
    </div>
  );
}
