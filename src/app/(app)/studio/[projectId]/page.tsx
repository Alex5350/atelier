import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import {
  eligibleReferenceAssets,
  getProject,
  lineageEdges,
  listActivity,
  listExports,
  listPassesWithAssets,
} from "@/lib/studio/queries";
import { imageModelChoices } from "@/lib/models/registry";
import { liveProviderStatuses } from "@/lib/models/server";
import { PassComposer } from "@/components/studio/pass-composer";
import { PassTimeline } from "@/components/studio/pass-timeline";
import { LineageCard } from "@/components/studio/lineage-graph";
import { ActivityCard } from "@/components/studio/activity-card";
import { db } from "@/db";
import { schema } from "@/db";
import { MotionStagger, MotionItem } from "@/components/app/motion";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await requireSession();
  const { projectId } = await params;
  const project = await getProject(session.user.id, projectId);
  if (!project) {
    notFound();
  }
  const passes = await listPassesWithAssets(projectId);
  const modelRows = await db.select().from(schema.models);
  const models = imageModelChoices(
    modelRows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      provider: row.provider,
      modality: row.modality,
      modelName: row.modelName,
      capabilities: (row.capabilities as string[]) ?? [],
      contextWindow: row.contextWindow,
      enabled: row.enabled,
      isMock: row.isMock,
    })),
    liveProviderStatuses(),
  );

  const assetTotal = passes.reduce((sum, pass) => sum + pass.assets.length, 0);
  const references = await eligibleReferenceAssets(projectId);
  const lineage = await lineageEdges(projectId);
  const activity = await listActivity(projectId);
  const projectExports = await listExports(projectId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <MotionStagger className="space-y-2">
        <MotionItem>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{project.title}</h1>
            <Badge variant="outline" className="text-muted-foreground">
              {passes.length} {passes.length === 1 ? "pass" : "passes"} · {assetTotal}{" "}
              {assetTotal === 1 ? "asset" : "assets"}
            </Badge>
          </div>
        </MotionItem>
        <MotionItem>
          <p className="text-sm text-muted-foreground">
            Every pass appends; regenerating steps the previous set aside for history.
          </p>
        </MotionItem>
      </MotionStagger>

      <MotionItem>
        {models.length > 0 ? (
          <PassComposer projectId={projectId} models={models} references={references} />
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 px-6 py-8 text-center text-sm text-muted-foreground">
            No image models are enabled. Enable one in Admin (the demo sketchpad needs no keys).
          </div>
        )}
      </MotionItem>

      <PassTimeline passes={passes} lineage={lineage} />
      <LineageCard passes={passes} lineage={lineage} />
      <ActivityCard
        activity={activity.map((entry) => ({ ...entry, detail: (entry.detail ?? {}) as Record<string, unknown> }))}
        exports={projectExports}
      />
    </div>
  );
}
