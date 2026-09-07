"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Film, Loader2, Play } from "lucide-react";
import type { ChatModelChoice } from "@/lib/models/registry";
import type { ReferenceChoice } from "./pass-composer";

type JobView = {
  id: string;
  status: string;
  prompt: string;
  seconds: number;
  createdAt: string | Date;
};

/**
 * The video surface: prompt, model, optional approved first frame, seconds.
 * Submission is a job; the card polls until the clip lands, then plays it.
 */
export function VideoCard({
  projectId,
  models,
  references,
  jobs,
}: {
  projectId: string;
  models: ChatModelChoice[];
  references: ReferenceChoice[];
  jobs: JobView[];
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [seconds, setSeconds] = useState(4);
  const [firstFrame, setFirstFrame] = useState("none");
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearInterval(timer.current);
      }
    };
  }, []);

  function poll(id: string) {
    setPolling(id);
    timer.current = setInterval(async () => {
      const response = await fetch(`/api/video/jobs/${id}`);
      const detail = (await response.json().catch(() => null)) as
        | { status?: string; error?: string }
        | null;
      if (detail?.status === "completed") {
        if (timer.current) {
          clearInterval(timer.current);
        }
        setPolling(null);
        toast.success("Clip ready");
        setBusy(false);
        router.refresh();
      } else if (detail?.status === "failed") {
        if (timer.current) {
          clearInterval(timer.current);
        }
        setPolling(null);
        setBusy(false);
        toast.error(detail.error ?? "The render failed");
        router.refresh();
      }
    }, 1_500);
  }

  async function submit() {
    if (busy || prompt.trim().length === 0) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/video/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          prompt,
          modelId,
          seconds,
          firstFrameAssetId: firstFrame !== "none" ? firstFrame : undefined,
        }),
      });
      const detail = (await response.json().catch(() => null)) as
        | { id?: string; message?: string; error?: string }
        | null;
      if (!response.ok || !detail?.id) {
        toast.error(detail?.message ?? detail?.error ?? "Submission failed");
        setBusy(false);
        return;
      }
      setPrompt("");
      poll(detail.id);
    } catch {
      setBusy(false);
    }
  }

  const working = busy || polling !== null;

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-heading">
          <Film className="size-4 text-primary" aria-hidden /> Video
        </CardTitle>
        <CardDescription>
          Short clips from a prompt, optionally starting from an approved frame. Jobs poll; the
          ledger records the seconds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="A slow pan across the copper doorway at dusk..."
          rows={2}
          className="resize-none"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Select value={modelId} onValueChange={(value) => value && setModelId(value)}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <span className="flex items-center gap-2">
                      {model.isMock ? <Play className="size-3.5 text-primary" aria-hidden /> : null}
                      {model.displayName}
                      {model.isMock ? <span className="text-[10px] text-primary">DEMO</span> : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Seconds</Label>
            <Select value={String(seconds)} onValueChange={(value) => setSeconds(Number(value))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 4, 6, 8].map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {references.length > 0 ? (
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">First frame (approved)</Label>
              <Select value={firstFrame} onValueChange={(value) => setFirstFrame(value ?? "none")}>
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
          ) : null}
          <Button onClick={() => void submit()} disabled={working || prompt.trim().length === 0}>
            {working ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Render clip
          </Button>
        </div>
        {jobs.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs.map((job) => (
              <div key={job.id} className="space-y-1.5 rounded-lg border border-border/60 p-2">
                {job.status === "completed" ? (
                  <video
                    controls
                    preload="metadata"
                    className="w-full rounded-md"
                    src={`/api/video/jobs/${job.id}/file`}
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center gap-2 rounded-md bg-muted/40 text-xs text-muted-foreground">
                    {job.status === "running" ? (
                      <>
                        <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> rendering...
                      </>
                    ) : (
                      <span className="text-destructive">failed</span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{job.prompt}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {job.seconds}s
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
