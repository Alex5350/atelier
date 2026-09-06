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
import { Sparkles, Loader2, Layers, Wand2, Expand, ArrowUpRight } from "lucide-react";
import type { ImageModelChoice } from "@/lib/models/registry";
import { MaskCanvas } from "./mask-canvas";

export type ReferenceChoice = { id: string; passSeq: number; seed: number | null };
type ToolKind = "generate" | "upscale" | "outpaint" | "inpaint";
const TOOLS: Array<{ value: ToolKind; label: string; icon: typeof Sparkles }> = [
  { value: "generate", label: "Generate", icon: Sparkles },
  { value: "inpaint", label: "Inpaint", icon: Wand2 },
  { value: "outpaint", label: "Outpaint", icon: Expand },
  { value: "upscale", label: "Upscale", icon: ArrowUpRight },
];

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
  references,
}: {
  projectId: string;
  models: ImageModelChoice[];
  references: ReferenceChoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [batchSize, setBatchSize] = useState(2);
  const [aspect, setAspect] = useState("square");
  const [seed, setSeed] = useState("");
  const [baseId, setBaseId] = useState("none");
  const [styleIds, setStyleIds] = useState<string[]>([]);
  const [kind, setKind] = useState<ToolKind>("generate");
  const [factor, setFactor] = useState(2);
  const [direction, setDirection] = useState("right");
  const [percent, setPercent] = useState(50);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);

  const anyMock = models.some((model) => model.isMock);

  function referencePayload() {
    const chosen: Array<{ assetId: string; role: "base" | "style" }> = [];
    if (baseId !== "none") {
      chosen.push({ assetId: baseId, role: "base" });
    }
    for (const styleId of styleIds) {
      chosen.push({ assetId: styleId, role: "style" });
    }
    return chosen;
  }

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
          references: referencePayload(),
          kind,
          toolSettings:
            kind === "upscale"
              ? { factor }
              : kind === "outpaint"
                ? { direction, percent }
                : kind === "inpaint"
                  ? { maskDataUrl: maskDataUrl ?? undefined }
                  : undefined,
        }),
      });
      if (!created.ok) {
        const detail = await created.json().catch(() => null);
        toast.error(
          detail?.message ? String(detail.message) : detail?.error ? String(detail.error) : "Could not create the pass",
        );
        return;
      }
      const { id } = (await created.json()) as { id: string };
      const ran = await fetch(`/api/passes/${id}/run`, { method: "POST" });
      const detail = (await ran.json().catch(() => null)) as
        | { status?: string; error?: string; message?: string; note?: string }
        | null;
      if (!ran.ok || detail?.status === "failed") {
        toast.error(detail?.message ?? detail?.error ?? "The run failed");
      } else {
        toast.success(
          detail?.status === "completed"
            ? detail.note
              ? `Pass complete: ${detail.note}`
              : `Pass complete: ${batchSize} asset(s)`
            : "Pass finished",
        );
        setSeed("");
        setMaskDataUrl(null);
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
        <div className="flex flex-wrap gap-1.5">
          {TOOLS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                kind === item.value
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-accent"
              }`}
              onClick={() => setKind(item.value)}
            >
              <item.icon className="size-3.5" aria-hidden />
              {item.label}
            </button>
          ))}
        </div>
        {kind === "inpaint" ? (
          <MaskCanvas
            baseAssetUrl={baseId !== "none" ? `/api/assets/${baseId}` : null}
            onChange={setMaskDataUrl}
          />
        ) : null}
        {kind === "outpaint" ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Direction</Label>
              <Select value={direction} onValueChange={(value) => value && setDirection(value)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["left", "right", "up", "down"].map((option) => (
                    <SelectItem key={option} value={option} className="capitalize">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Extend by</Label>
              <Select value={String(percent)} onValueChange={(value) => setPercent(Number(value))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100].map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
        {kind === "upscale" ? (
          <div className="grid w-fit gap-1">
            <Label className="text-xs text-muted-foreground">Factor (deterministic Lanczos, no model)</Label>
            <Select value={String(factor)} onValueChange={(value) => setFactor(Number(value))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4].map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}x
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <div className={`grid gap-1 ${kind === "upscale" ? "opacity-40" : ""}`}>
            <Label className="text-xs text-muted-foreground">
              Model{kind === "upscale" ? " (unused: deterministic)" : ""}
            </Label>
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
          {references.length > 0 ? (
            <>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Base (composition)</Label>
                <Select value={baseId} onValueChange={(value) => setBaseId(value ?? "none")}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">none</SelectItem>
                    {references.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id}>
                        pass {asset.passSeq}
                        {asset.seed !== null ? ` seed ${asset.seed}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Layers className="size-3" aria-hidden /> Style (aesthetics, up to 3)
                </Label>
                <div className="flex max-w-72 flex-wrap gap-1.5">
                  {references.map((asset) => {
                    const selected = styleIds.includes(asset.id);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                          selected
                            ? "border-primary/50 bg-primary/15 text-primary"
                            : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-accent"
                        }`}
                        onClick={() =>
                          setStyleIds((current) =>
                            current.includes(asset.id)
                              ? current.filter((id) => id !== asset.id)
                              : current.length < 3
                                ? [...current, asset.id]
                                : current,
                          )
                        }
                      >
                        pass {asset.passSeq}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
          <Button
            onClick={() => void run()}
            disabled={
              working ||
              (kind === "generate" && prompt.trim().length === 0) ||
              (kind !== "generate" && baseId === "none") ||
              (kind === "inpaint" && !maskDataUrl)
            }
          >
            {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Run pass
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
