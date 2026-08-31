"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, RotateCcw } from "lucide-react";

type TimelinePass = {
  id: string;
  seq: number;
  kind: string;
  status: string;
  prompt: string;
  batchSize: number;
  error: string | null;
  assets: Array<{
    id: string;
    width: number | null;
    height: number | null;
    seed: number | null;
    isActive: boolean;
    reviewStatus: string;
  }>;
};

const STATUS_CLASS: Record<string, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  running: "border-primary/40 bg-primary/10 text-primary",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};

/**
 * The pass timeline: newest first, each pass showing its active assets (and
 * its superseded history dimmed), with regenerate on completed passes.
 */
export function PassTimeline({ passes }: { passes: TimelinePass[] }) {
  const ordered = [...passes].sort((a, b) => b.seq - a.seq);

  if (ordered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center text-sm text-muted-foreground">
        No passes yet. Compose the first one above.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ordered.map((pass) => (
        <PassCard key={pass.id} pass={pass} />
      ))}
    </div>
  );
}

function PassCard({ pass }: { pass: TimelinePass }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const active = pass.assets.filter((asset) => asset.isActive);
  const superseded = pass.assets.filter((asset) => !asset.isActive);

  async function regenerate() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/passes/${pass.id}/run`, { method: "POST" });
      const detail = (await response.json().catch(() => null)) as
        | { status?: string; message?: string; error?: string }
        | null;
      if (!response.ok || detail?.status === "failed") {
        toast.error(detail?.message ?? detail?.error ?? "The run failed");
      } else {
        toast.success(`Regenerated: ${pass.batchSize} new asset(s), prior batch kept below`);
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm font-semibold">Pass {pass.seq}</span>
          <Badge variant="outline" className={STATUS_CLASS[pass.status] ?? ""}>
            {pass.status}
          </Badge>
          <span className="text-xs text-muted-foreground">batch {pass.batchSize}</span>
          {pass.status === "completed" ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-xs"
              disabled={busy}
              onClick={() => void regenerate()}
            >
              {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <RotateCcw className="size-3" aria-hidden />}
              Regenerate
            </Button>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{pass.prompt}</p>
        {pass.error ? (
          <p className="text-xs text-destructive">{pass.error}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {pass.status === "running" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
            Generating {pass.batchSize} image{pass.batchSize === 1 ? "" : "s"}...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {active.map((asset) => (
                <a
                  key={asset.id}
                  href={`/api/assets/${asset.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group block overflow-hidden rounded-lg ring-1 ring-border/60"
                >
                  {/* Authenticated generated blobs; next/image does not apply. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${asset.id}`}
                    alt={`Pass ${pass.seq} asset${asset.seed !== null ? `, seed ${asset.seed}` : ""}`}
                    className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
                  />
                </a>
              ))}
            </div>
            {superseded.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {superseded.length} superseded by earlier runs
                </summary>
                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {superseded.map((asset) => (
                    <a
                      key={asset.id}
                      href={`/api/assets/${asset.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md ring-1 ring-border/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/assets/${asset.id}`}
                        alt="Superseded asset"
                        className="aspect-square w-full object-cover opacity-40"
                      />
                    </a>
                  ))}
                </div>
              </details>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
