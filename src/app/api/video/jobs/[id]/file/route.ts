import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { storage } from "@/lib/storage";

/** Streams a completed clip, owner-scoped. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await context.params;
  const [row] = await db
    .select({ job: schema.videoJobs })
    .from(schema.videoJobs)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.videoJobs.projectId))
    .where(and(eq(schema.videoJobs.id, id), eq(schema.projects.userId, session.user.id)))
    .limit(1);
  if (!row?.job.storageKey) {
    return new Response("not found", { status: 404 });
  }
  const blob = await storage.get(row.job.storageKey).catch(() => null);
  if (!blob) {
    return new Response("storage unavailable", { status: 503 });
  }
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      "content-type": "video/mp4",
      "content-length": String(blob.bytes.length),
      "cache-control": "private, max-age=3600",
      "accept-ranges": "bytes",
    },
  });
}
