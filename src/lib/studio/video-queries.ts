import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function listVideoJobs(projectId: string) {
  return db
    .select({
      id: schema.videoJobs.id,
      status: schema.videoJobs.status,
      prompt: schema.videoJobs.prompt,
      seconds: schema.videoJobs.seconds,
      createdAt: schema.videoJobs.createdAt,
    })
    .from(schema.videoJobs)
    .where(eq(schema.videoJobs.projectId, projectId))
    .orderBy(desc(schema.videoJobs.createdAt))
    .limit(6);
}
