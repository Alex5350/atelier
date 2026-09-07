import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getProject } from "@/lib/studio/queries";
import { resolveVideoProvider, VideoRegistryError } from "@/lib/video/server";
import { storage } from "@/lib/storage";
import { budgetDecision } from "@/lib/usage/core";
import { budgetCapUsd, spendTodayUsd } from "@/lib/usage/queries";
import { priceEffectiveAt, type PriceRow } from "@/lib/models/registry";

/** Submits a video job: budget-gated, provider-resolved, first-frame optional. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    projectId?: string;
    prompt?: string;
    modelId?: string;
    seconds?: number;
    firstFrameAssetId?: string;
  };
  if (!body.projectId || !body.prompt?.trim()) {
    return Response.json({ error: "projectId and prompt are required" }, { status: 400 });
  }
  const project = await getProject(session.user.id, body.projectId);
  if (!project) {
    return Response.json({ error: "unknown-project" }, { status: 404 });
  }

  const registryId = body.modelId ?? "mock/atelier-reel";
  const [modelRow] = await db.select().from(schema.models).where(eq(schema.models.id, registryId)).limit(1);
  if (!modelRow || modelRow.modality !== "video" || !modelRow.enabled) {
    return Response.json({ error: "unknown-video-model" }, { status: 400 });
  }

  // First frame must be an approved asset when supplied: same gate, same rule.
  let firstFrame: Uint8Array | undefined;
  if (body.firstFrameAssetId) {
    const [asset] = await db
      .select()
      .from(schema.assets)
      .innerJoin(schema.passes, eq(schema.passes.id, schema.assets.passId))
      .where(
        and(
          eq(schema.assets.id, body.firstFrameAssetId),
          eq(schema.passes.projectId, body.projectId),
        ),
      )
      .limit(1);
    if (!asset || asset.assets.reviewStatus !== "approved") {
      return Response.json({ error: "first-frame-not-approved" }, { status: 409 });
    }
    firstFrame = new Uint8Array((await storage.get(asset.assets.storageKey)).bytes);
  }

  // Budget gate: seconds against the per-second price.
  const seconds = Math.min(8, Math.max(2, body.seconds ?? 4));
  const prices: PriceRow[] = (
    await db.select().from(schema.modelPrices).where(eq(schema.modelPrices.modelId, registryId))
  ).map((row) => ({
    modelId: row.modelId,
    effectiveFrom: row.effectiveFrom,
    inputPerMtok: row.inputPerMtok,
    outputPerMtok: row.outputPerMtok,
    perImage: row.perImage,
    perVideoSecond: row.perVideoSecond,
  }));
  const price = priceEffectiveAt(prices, new Date());
  const estimate = price?.perVideoSecond ? Number(price.perVideoSecond) * seconds : 0;
  const decision = budgetDecision(await spendTodayUsd(session.user.id), await budgetCapUsd(session.user.id), estimate);
  if (!decision.allowed) {
    return Response.json(
      { error: "budget-exceeded", message: `This clip estimates $${decision.estimateUsd.toFixed(4)} against today's remaining budget.` },
      { status: 402 },
    );
  }

  let provider;
  try {
    provider = resolveVideoProvider(modelRow.provider, modelRow.modelName, {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
  } catch (error) {
    if (error instanceof VideoRegistryError) {
      return Response.json({ error: error.code, message: error.message }, { status: 409 });
    }
    throw error;
  }

  try {
    const { externalId } = await provider.submit({
      prompt: body.prompt.trim(),
      seconds,
      firstFrame,
      modelId: modelRow.modelName,
    });
    const id = crypto.randomUUID();
    await db.insert(schema.videoJobs).values({
      id,
      projectId: body.projectId,
      provider: modelRow.provider,
      modelId: registryId,
      prompt: body.prompt.trim(),
      seconds,
      firstFrameAssetId: body.firstFrameAssetId ?? null,
      externalId,
      status: "running",
    });
    return Response.json({ id, status: "running" }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: "submit-failed", message: error instanceof Error ? error.message : "submission failed" },
      { status: 502 },
    );
  }
}
