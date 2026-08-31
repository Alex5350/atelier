import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Studio persistence: projects own an ordered list of passes; passes emit
 * assets. All reads are owner-scoped through the project join.
 */

export async function listProjects(userId: string) {
  const rows = await db
    .select({
      id: schema.projects.id,
      title: schema.projects.title,
      updatedAt: schema.projects.updatedAt,
      passCount: sql<number>`(select count(*) from ${schema.passes} where ${schema.passes.projectId} = ${schema.projects.id})::int`,
      assetCount: sql<number>`(select count(*) from ${schema.assets} inner join ${schema.passes} on ${schema.passes.id} = ${schema.assets.passId} where ${schema.passes.projectId} = ${schema.projects.id})::int`,
    })
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));
  return rows;
}

export async function createProject(userId: string, title: string) {
  const id = crypto.randomUUID();
  await db.insert(schema.projects).values({ id, userId, title: title.trim() || "Untitled project" });
  return id;
}

export async function getProject(userId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listPassesWithAssets(projectId: string) {
  const passRows = await db
    .select()
    .from(schema.passes)
    .where(eq(schema.passes.projectId, projectId))
    .orderBy(schema.passes.seq);
  const assetRows = await db
    .select({
      id: schema.assets.id,
      passId: schema.assets.passId,
      width: schema.assets.width,
      height: schema.assets.height,
      seed: schema.assets.seed,
      isActive: schema.assets.isActive,
      reviewStatus: schema.assets.reviewStatus,
      createdAt: schema.assets.createdAt,
    })
    .from(schema.assets)
    .innerJoin(schema.passes, eq(schema.passes.id, schema.assets.passId))
    .where(eq(schema.passes.projectId, projectId))
    .orderBy(schema.assets.createdAt);

  return passRows.map((pass) => ({
    ...pass,
    assets: assetRows.filter((asset) => asset.passId === pass.id),
  }));
}

export type NewPassInput = {
  projectId: string;
  prompt: string;
  modelId: string;
  batchSize: number;
  aspect: string;
  seed: number | null;
};

export async function createPass(input: NewPassInput) {
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${schema.passes.seq}), 0) + 1` })
    .from(schema.passes)
    .where(eq(schema.passes.projectId, input.projectId));

  const id = crypto.randomUUID();
  await db.insert(schema.passes).values({
    id,
    projectId: input.projectId,
    seq: next,
    kind: "generate",
    status: "draft",
    prompt: input.prompt.trim(),
    modelId: input.modelId,
    batchSize: input.batchSize,
    settings: { aspect: input.aspect, seed: input.seed },
  });
  await db
    .update(schema.projects)
    .set({ updatedAt: new Date() })
    .where(eq(schema.projects.id, input.projectId));
  return id;
}

export async function getPassForUser(userId: string, passId: string) {
  const [row] = await db
    .select({ pass: schema.passes, project: schema.projects })
    .from(schema.passes)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.passes.projectId))
    .where(and(eq(schema.passes.id, passId), eq(schema.projects.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function touchProject(projectId: string) {
  await db.update(schema.projects).set({ updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
}

/** Aspect label to pixel size; the map is the single source both UI and route share. */
export const ASPECT_SIZES: Record<string, `${number}x${number}`> = {
  square: "1024x1024",
  landscape: "1280x768",
  portrait: "768x1280",
};

export function sizeForAspect(aspect: string | undefined): `${number}x${number}` {
  return ASPECT_SIZES[aspect ?? "square"] ?? ASPECT_SIZES.square;
}
