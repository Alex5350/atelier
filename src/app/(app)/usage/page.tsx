import type { Metadata } from "next";
import { requireSession } from "@/lib/session";
import { formatUsd } from "@/lib/usage/core";
import {
  budgetCapUsd,
  recentUsageEvents,
  spendByModelToday,
  spendLast7DaysUsd,
  spendTodayUsd,
} from "@/lib/usage/queries";
import { updateBudgetCap } from "./actions";
import { MotionStagger, MotionItem } from "@/components/app/motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "Usage" };

export default async function UsagePage() {
  const session = await requireSession();
  const [spent, cap, byModel, events, week] = await Promise.all([
    spendTodayUsd(session.user.id),
    budgetCapUsd(session.user.id),
    spendByModelToday(session.user.id),
    recentUsageEvents(session.user.id),
    spendLast7DaysUsd(session.user.id),
  ]);

  const remaining = Math.max(0, cap - spent);
  const usedRatio = cap > 0 ? Math.min(1, spent / cap) : spent > 0 ? 1 : 0;
  const weekMax = Math.max(...week.map((day) => day.cost), 0.01);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MotionStagger className="space-y-2">
        <MotionItem>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Usage and budget</h1>
        </MotionItem>
        <MotionItem>
          <p className="text-sm text-muted-foreground">
            Every model call lands in the ledger with the price it was estimated against. Costs are
            estimates for telemetry, not billing truth; the budget gate refuses calls that would
            exceed the daily cap before a token is billed.
          </p>
        </MotionItem>
      </MotionStagger>

      <MotionStagger className="grid gap-4 md:grid-cols-3">
        <MotionItem>
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Wallet className="size-3.5" aria-hidden /> Spent today
              </CardDescription>
              <CardTitle className="font-heading text-2xl tabular-nums">{formatUsd(spent)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{formatUsd(remaining)} remaining</span>
                <span>cap {formatUsd(cap)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${usedRatio >= 1 ? "bg-destructive" : usedRatio > 0.8 ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${Math.round(usedRatio * 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </MotionItem>
        <MotionItem>
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ShieldAlert className="size-3.5" aria-hidden /> Daily budget
              </CardDescription>
              <CardTitle className="font-heading text-2xl">{formatUsd(cap)}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateBudgetCap} className="flex items-end gap-2">
                <div className="grid flex-1 gap-1">
                  <Label htmlFor="dailyCap" className="text-xs text-muted-foreground">
                    New cap (USD, resets midnight UTC)
                  </Label>
                  <Input id="dailyCap" name="dailyCap" type="number" min="0" step="0.25" defaultValue={cap} className="h-9" />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  Set
                </Button>
              </form>
            </CardContent>
          </Card>
        </MotionItem>
        <MotionItem>
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardDescription>Last 7 days</CardDescription>
              <CardTitle className="font-heading text-2xl tabular-nums">
                {formatUsd(week.reduce((sum, day) => sum + day.cost, 0))}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-16 items-end gap-1" aria-hidden>
                {week.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No spend recorded yet.</div>
                ) : (
                  week.map((day) => (
                    <div key={day.day} className="flex-1" title={`${day.day}: ${formatUsd(day.cost)}`}>
                      <div
                        className="w-full rounded-sm bg-primary/70"
                        style={{ height: `${Math.max(4, Math.round((day.cost / weekMax) * 60))}px` }}
                      />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </MotionItem>
      </MotionStagger>

      <MotionItem>
        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="font-heading">Today by model</CardTitle>
            <CardDescription>
              {byModel.length === 0
                ? "No calls yet today. Say something in Chat and this table fills in."
                : `${byModel.reduce((sum, row) => sum + row.calls, 0)} calls across ${byModel.length} models.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Tokens in</TableHead>
                  <TableHead>Tokens out</TableHead>
                  <TableHead className="text-right">Estimated cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byModel.map((row) => (
                  <TableRow key={row.modelId}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {row.displayName}
                        {row.isMock ? (
                          <Badge variant="outline" className="h-4 border-primary/40 bg-primary/10 px-1.5 text-[10px] text-primary">
                            DEMO
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">{row.calls}</TableCell>
                    <TableCell className="tabular-nums">{row.inputTokens.toLocaleString()}</TableCell>
                    <TableCell className="tabular-nums">{row.outputTokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(Number(row.cost))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </MotionItem>

      <MotionItem>
        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="font-heading">Recent events</CardTitle>
            <CardDescription>The ledger is append-only; rows pin the price they were charged at.</CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                The ledger is empty. The first model call will be the first row.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm odd:bg-muted/40"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="text-xs text-muted-foreground">
                        {event.createdAt.toLocaleTimeString()}
                      </span>
                      <span className="truncate">{event.displayName}</span>
                      {event.isMock ? <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-primary">DEMO</Badge> : null}
                    </span>
                    <span className="ml-3 shrink-0 tabular-nums text-muted-foreground">
                      {event.inputTokens.toLocaleString()} in / {event.outputTokens.toLocaleString()} out ·{" "}
                      <span className="text-foreground">{formatUsd(Number(event.cost))}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </MotionItem>
    </div>
  );
}
