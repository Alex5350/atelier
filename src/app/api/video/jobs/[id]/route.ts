import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { resolveVideoProvider } from "@/lib/video/server";
import { storage } from "@/lib/storage";
import { writeUsageEvent } from "@/lib/usage/queries";
import { logActivity, touchProject } from "@/lib/studio/queries";

/** Polls a job; completion stores the clip and writes the usage ledger. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const [row] = await db
    .select({ job: schema.videoJobs })
    .from(schema.videoJobs)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.videoJobs.projectId))
    .where(and(eq(schema.videoJobs.id, id), eq(schema.projects.userId, session.user.id)))
    .limit(1);
  if (!row) {
    return Response.json({ error: "unknown-job" }, { status: 404 });
  }
  const job = row.job;
  if (job.status !== "running" || !job.externalId || !job.modelId) {
    return Response.json({ id, status: job.status, url: job.storageKey ? `/api/video/jobs/${id}/file` : null });
  }

  const [modelRow] = await db.select().from(schema.models).where(eq(schema.models.id, job.modelId)).limit(1);
  if (!modelRow) {
    return Response.json({ id, status: "failed", error: "model vanished from registry" });
  }
  const provider = resolveVideoProvider(modelRow.provider, modelRow.modelName, {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
  const poll = await provider.poll(job.externalId).catch((error: unknown) => ({
    status: "failed" as const,
    error: error instanceof Error ? error.message : "poll failed",
  }));

  if (poll.status === "running") {
    return Response.json({ id, status: "running" });
  }
  if (poll.status === "failed" || !poll.video) {
    await db
      .update(schema.videoJobs)
      .set({ status: "failed", error: poll.error ?? "no video returned" })
      .where(eq(schema.videoJobs.id, id));
    return Response.json({ id, status: "failed", error: poll.error });
  }

  const { key } = await storage.put(poll.video, "video/mp4");
  await db
    .update(schema.videoJobs)
    .set({ status: "completed", storageKey: key, bytes: poll.video.length })
    .where(eq(schema.videoJobs.id, id));
  await writeUsageEvent({
    userId: session.user.id,
    modelId: job.modelId,
    kind: "video",
    inputTokens: 0,
    outputTokens: 0,
    videoSeconds: poll.usageSeconds ?? job.seconds,
  });
  await logActivity(job.projectId, "video.render", {
    jobId: id,
    modelId: job.modelId,
    seconds: poll.usageSeconds ?? job.seconds,
  });
  await touchProject(job.projectId);
  return Response.json({ id, status: "completed", url: `/api/video/jobs/${id}/file` });
}
