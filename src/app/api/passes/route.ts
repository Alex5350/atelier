import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createPass, getProject } from "@/lib/studio/queries";

const ASPECTS = new Set(["square", "landscape", "portrait"]);

/** Creates a draft generate pass at the end of the project's timeline. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    projectId?: string;
    prompt?: string;
    modelId?: string;
    batchSize?: number;
    aspect?: string;
    seed?: number | null;
    kind?: "generate" | "upscale" | "outpaint" | "inpaint";
    toolSettings?: { factor?: number; direction?: string; percent?: number; maskDataUrl?: string };
    references?: Array<{ assetId: string; role: "base" | "style" }>;
  };

  const kind0 = body.kind ?? "generate";
  if (!body.projectId || (kind0 === "generate" && (!body.prompt || body.prompt.trim().length === 0))) {
    return Response.json({ error: "projectId and prompt are required" }, { status: 400 });
  }
  const project = await getProject(session.user.id, body.projectId);
  if (!project) {
    return Response.json({ error: "unknown-project" }, { status: 404 });
  }
  const kind = body.kind ?? "generate";
  if (!body.modelId && kind !== "upscale") {
    return Response.json({ error: "modelId is required" }, { status: 400 });
  }
  let model: typeof schema.models.$inferSelect | undefined;
  if (body.modelId) {
    [model] = await db.select().from(schema.models).where(eq(schema.models.id, body.modelId)).limit(1);
    if (!model || model.modality !== "image") {
      return Response.json({ error: "unknown-image-model" }, { status: 400 });
    }
  }
  const baseRequired = kind !== "generate";
  const hasBase = (body.references ?? []).some((reference) => reference.role === "base");
  if (baseRequired && !hasBase) {
    return Response.json({ error: "tool passes require a base reference" }, { status: 400 });
  }
  if (kind === "inpaint" && !body.toolSettings?.maskDataUrl) {
    return Response.json({ error: "inpaint requires a painted mask" }, { status: 400 });
  }

  const batchSize = [1, 2, 4, 6, 8].includes(body.batchSize ?? 1) ? (body.batchSize ?? 1) : 1;
  const aspect = ASPECTS.has(body.aspect ?? "square") ? (body.aspect ?? "square") : "square";
  const seed =
    typeof body.seed === "number" && Number.isInteger(body.seed) && body.seed >= 0 ? body.seed : null;

  const direction = ["left", "right", "up", "down"].includes(body.toolSettings?.direction ?? "")
    ? (body.toolSettings!.direction as "left" | "right" | "up" | "down")
    : undefined;
  const settings =
    kind === "upscale"
      ? { factor: [2, 3, 4].includes(body.toolSettings?.factor ?? 2) ? body.toolSettings?.factor ?? 2 : 2 }
      : kind === "outpaint"
        ? {
            direction,
            percent: Math.min(100, Math.max(10, body.toolSettings?.percent ?? 50)),
            seed,
          }
        : kind === "inpaint"
          ? { maskDataUrl: body.toolSettings?.maskDataUrl, seed }
          : { aspect, seed };

  const id = await createPass({
    projectId: body.projectId,
    prompt: body.prompt ?? "",
    modelId: body.modelId ?? null,
    batchSize,
    aspect,
    seed,
  });
  await db
    .update(schema.passes)
    .set({ kind, settings })
    .where(eq(schema.passes.id, id));

  // References land through the gating trigger: only approved assets pass,
  // and the error names the offender for the client to surface.
  const references = (body.references ?? []).slice(0, 4);
  const bases = references.filter((ref) => ref.role === "base");
  if (bases.length > 1) {
    return Response.json({ error: "one-base-max" }, { status: 400 });
  }
  for (const reference of references) {
    try {
      await db.insert(schema.assetReferences).values({
        id: crypto.randomUUID(),
        passId: id,
        assetId: reference.assetId,
        role: reference.role,
      });
    } catch (error) {
      // Prefer the trigger's own words (drizzle wraps them in a cause).
      const cause = (error as { cause?: { message?: string } })?.cause?.message;
      const message = cause ?? (error instanceof Error ? error.message : "reference rejected");
      await db.delete(schema.passes).where(eq(schema.passes.id, id));
      return Response.json(
        { error: "gated-reference", message: message.replace(/\s+/g, " ") },
        { status: 409 },
      );
    }
  }
  return Response.json({ id }, { status: 201 });
}
