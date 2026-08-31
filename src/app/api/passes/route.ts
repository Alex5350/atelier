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
    references?: Array<{ assetId: string; role: "base" | "style" }>;
  };

  if (!body.projectId || !body.prompt || body.prompt.trim().length === 0) {
    return Response.json({ error: "projectId and prompt are required" }, { status: 400 });
  }
  const project = await getProject(session.user.id, body.projectId);
  if (!project) {
    return Response.json({ error: "unknown-project" }, { status: 404 });
  }
  if (!body.modelId) {
    return Response.json({ error: "modelId is required" }, { status: 400 });
  }
  const [model] = await db.select().from(schema.models).where(eq(schema.models.id, body.modelId)).limit(1);
  if (!model || model.modality !== "image") {
    return Response.json({ error: "unknown-image-model" }, { status: 400 });
  }

  const batchSize = [1, 2, 4, 6, 8].includes(body.batchSize ?? 1) ? (body.batchSize ?? 1) : 1;
  const aspect = ASPECTS.has(body.aspect ?? "square") ? (body.aspect ?? "square") : "square";
  const seed =
    typeof body.seed === "number" && Number.isInteger(body.seed) && body.seed >= 0 ? body.seed : null;

  const id = await createPass({
    projectId: body.projectId,
    prompt: body.prompt,
    modelId: body.modelId,
    batchSize,
    aspect,
    seed,
  });

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
