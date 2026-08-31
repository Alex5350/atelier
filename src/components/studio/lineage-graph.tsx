"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch } from "lucide-react";

type LineageEdge = {
  referenceId: string;
  role: string;
  referencingPassId: string;
  referencingSeq: number;
  referencedAssetId: string;
  referencedPassId: string;
};

type LineagePass = {
  id: string;
  seq: number;
  prompt: string;
  assets: Array<{ id: string; isActive: boolean }>;
};

/**
 * The derivation graph: passes as columns in sequence order, assets stacked
 * within, and curved reference edges (base solid, style dashed). Derived from
 * the reference table, never stored twice.
 */
export function LineageCard({
  passes,
  lineage,
}: {
  passes: LineagePass[];
  lineage: LineageEdge[];
}) {
  if (lineage.length === 0) {
    return null;
  }

  const ordered = [...passes].sort((a, b) => a.seq - b.seq);
  const columnWidth = 168;
  const rowHeight = 118;
  const width = Math.max(ordered.length, 2) * columnWidth + 40;
  const height = 300;

  const columnX = (seq: number) => 30 + (ordered.findIndex((p) => p.seq === seq)) * columnWidth + 44;
  const assetY = (pass: LineagePass, assetId: string) => {
    const index = Math.max(0, pass.assets.findIndex((asset) => asset.id === assetId));
    return 60 + (index % 2) * rowHeight + 24;
  };
  const passY = (seq: number) => 60;

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-heading">
          <GitBranch className="size-4 text-primary" aria-hidden /> Lineage
        </CardTitle>
        <CardDescription>
          How every asset derives from another: solid edges carry composition (base), dashed edges
          carry aesthetics (style).
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[36rem]"
          role="img"
          aria-label="Pass lineage graph"
        >
          {ordered.map((pass) => (
            <g key={pass.id}>
              <rect
                x={columnX(pass.seq) - 44}
                y={passY(pass.seq) - 28}
                width="112"
                height={height - 60}
                rx="10"
                fill="hsl(var(--muted) / 0.35)"
                stroke="hsl(var(--border) / 0.6)"
              />
              <text
                x={columnX(pass.seq) + 12}
                y={passY(pass.seq) - 8}
                textAnchor="middle"
                font-size="11"
                fill="hsl(var(--muted-foreground))"
              >
                pass {pass.seq}
              </text>
              {pass.assets
                .filter((asset) => asset.isActive)
                .slice(0, 2)
                .map((asset, index) => (
                  <circle
                    key={asset.id}
                    cx={columnX(pass.seq) + 12}
                    cy={60 + index * rowHeight + 24}
                    r="7"
                    fill="hsl(var(--primary) / 0.8)"
                  />
                ))}
            </g>
          ))}
          {lineage.map((edge) => {
            const referencedPass = ordered.find((pass) => pass.id === edge.referencedPassId);
            const referencingX = columnX(edge.referencingSeq) - 20;
            if (!referencedPass) {
              return null;
            }
            const fromX = columnX(referencedPass.seq) + 20;
            const fromY = assetY(referencedPass, edge.referencedAssetId);
            const toY = passY(edge.referencingSeq) + 24;
            const midX = (fromX + referencingX) / 2;
            return (
              <path
                key={edge.referenceId}
                d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${referencingX} ${toY}`}
                fill="none"
                stroke="hsl(var(--primary) / 0.75)"
                strokeWidth={edge.role === "base" ? 2 : 1.4}
                strokeDasharray={edge.role === "style" ? "5 4" : undefined}
              />
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
