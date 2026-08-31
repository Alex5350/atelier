"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";
import type { ImageModelChoice } from "@/lib/models/registry";

const BATCHES = [1, 2, 4, 6, 8];
const ASPECTS = [
  { value: "square", label: "Square 1024" },
  { value: "landscape", label: "Landscape 1280 x 768" },
  { value: "portrait", label: "Portrait 768 x 1280" },
];

/**
 * Composes a generate pass and immediately runs it. The run is a single
 * request: create draft, run to completion, then refresh the timeline.
 */
export function PassComposer({
  projectId,
  models,
}: {
  projectId: string;
  models: ImageModelChoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [batchSize, setBatchSize] = useState(2);
  const [aspect, setAspect] = useState("square");
  const [seed, setSeed] = useState("");

  const anyMock = models.some((model) => model.isMock);

  async function run() {
    if (prompt.trim().length === 0 || busy) {
      return;
    }
    setBusy(true);
    try {
      const created = await fetch("/api/passes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt,
          modelId,
          batchSize,
          aspect,
          seed: seed.trim().length > 0 ? Number(seed) : null,
        }),
      });
      if (!created.ok) {
        const detail = await created.json().catch(() => null);
        toast.error(detail?.error ? String(detail.error) : "Could not create the pass");
        return;
      }
      const { id } = (await created.json()) as { id: string };
      const ran = await fetch(`/api/passes/${id}/run`, { method: "POST" });
      const detail = (await ran.json().catch(() => null)) as
        | { status?: string; error?: string; message?: string }
        | null;
      if (!ran.ok || detail?.status === "failed") {
        toast.error(detail?.message ?? detail?.error ?? "The run failed");
      } else {
        toast.success(
          detail?.status === "completed" ? `Pass complete: ${batchSize} asset(s)` : "Pass finished",
        );
        setSeed("");
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading">
          <Sparkles className="size-4 text-primary" aria-hidden /> New pass
        </CardTitle>
        <CardDescription>
          {anyMock
            ? "No image provider key is configured, so the demo sketchpad renders deterministic compositions; wire a key in Admin for real generation."
            : "Prompt, model, and batch. The run lands in the ledger before it starts."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="A weathered copper doorway, evening light, painterly..."
          rows={3}
          className="resize-none"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Select value={modelId} onValueChange={(value) => value && setModelId(value)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <span className="flex items-center gap-2">
                      {model.isMock ? <Sparkles className="size-3.5 text-primary" aria-hidden /> : null}
                      {model.displayName}
                      {model.isMock ? <span className="text-[10px] text-primary">DEMO</span> : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Batch</Label>
            <Select value={String(batchSize)} onValueChange={(value) => setBatchSize(Number(value))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BATCHES.map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Aspect</Label>
            <Select value={aspect} onValueChange={(value) => value && setAspect(value)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECTS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Seed</Label>
            <Input
              value={seed}
              onChange={(event) => setSeed(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="random"
              className="w-24"
              inputMode="numeric"
            />
          </div>
          <Button onClick={() => void run()} disabled={working || prompt.trim().length === 0}>
            {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Run pass
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
