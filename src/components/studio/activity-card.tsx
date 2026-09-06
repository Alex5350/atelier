"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Download } from "lucide-react";

type ActivityEntry = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string | Date;
};

type ExportEntry = {
  id: string;
  assetId: string;
  format: string;
  bytes: number;
  createdAt: string | Date;
};

/**
 * The project's story: the append-only activity log beside the export log.
 * Exports are downloads, never passes or assets.
 */
export function ActivityCard({
  activity,
  exports,
}: {
  activity: ActivityEntry[];
  exports: ExportEntry[];
}) {
  const ordered = [...activity].reverse().slice(0, 12);
  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-heading">
          <History className="size-4 text-primary" aria-hidden /> Activity
        </CardTitle>
        <CardDescription>
          Every run, decision, and export, append-only: {activity.length} entries
          {exports.length > 0 ? ` · ${exports.length} exports` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {ordered.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Nothing yet; the log fills as you work.
          </div>
        ) : (
          ordered.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm odd:bg-muted/40"
            >
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleTimeString()}
                </span>
                <Badge variant="outline" className="h-5 text-[10px]">
                  {entry.action}
                </Badge>
              </span>
              <span className="ml-3 truncate text-xs text-muted-foreground">
                {summarize(entry)}
              </span>
            </div>
          ))
        )}
        {exports.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {exports.slice(-6).reverse().map((entry) => (
              <a
                key={entry.id}
                href={`/api/exports/${entry.id}`}
                className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs transition-colors hover:bg-accent"
              >
                <Download className="size-3" aria-hidden />
                {entry.format} · {(entry.bytes / 1024).toFixed(0)} KB
              </a>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function summarize(entry: ActivityEntry): string {
  if (entry.action === "pass.run") {
    return `batch ${String(entry.detail.batchSize ?? "?")} via ${String(entry.detail.modelId ?? "model")}`;
  }
  if (entry.action === "tool.upscale" || entry.action === "tool.outpaint" || entry.action === "tool.inpaint") {
    return String(entry.detail.note ?? "");
  }
  if (entry.action === "review") {
    return `asset ${String(entry.detail.assetId ?? "").slice(0, 8)} -> ${String(entry.detail.review ?? "")}`;
  }
  if (entry.action === "export") {
    return `${String(entry.detail.format ?? "?")} · ${Number(entry.detail.bytes ?? 0).toLocaleString()} bytes`;
  }
  return "";
}
