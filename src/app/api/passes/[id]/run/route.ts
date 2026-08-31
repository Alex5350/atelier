import { and, eq } from "drizzle-orm";
import { generateImage } from "ai";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { RegistryError, resolveImageModel } from "@/lib/models/server";
import { getPassForUser, sizeForAspect, touchProject } from "@/lib/studio/queries";
import { storage } from "@/lib/storage";
import { budgetDecision } from "@/lib/usage/core";
import { budgetCapUsd, spendTodayUsd, writeUsageEvent } from "@/lib/usage/queries";
import type { PriceRow } from "@/lib/models/registry";
import { priceEffectiveAt } from "@/lib/models/registry";

export const maxDuration = 120;

/**
 * Runs a generate pass: budget gate, model resolution, one provider image per
 * batch slot (seed varied per slot), storage, and asset rows. Regenerating a
 * pass that already has assets is append-only: the previous set flips to
 * inactive for history and comparison, then the new batch appends.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const owned = await getPassForUser(session.user.id, id);
  if (!owned) {
    return Response.json({ error: "unknown-pass" }, { status: 404 });
  }
  const { pass, project } = owned;

  if (pass.status === "running") {
    return Response.json({ error: "already-running" }, { status: 409 });
  }
  if (pass.prompt.trim().length === 0) {
    return Response.json({ error: "empty-prompt" }, { status: 400 });
  }
  if (!pass.modelId) {
    return Response.json({ error: "no-model" }, { status: 400 });
  }

  const [modelRow] = await db.select().from(schema.models).where(eq(schema.models.id, pass.modelId)).limit(1);
  if (!modelRow) {
    return Response.json({ error: "unknown-model" }, { status: 400 });
  }

  let imageModel;
  try {
    imageModel = resolveImageModel({
      id: modelRow.id,
      displayName: modelRow.displayName,
      provider: modelRow.provider,
      modality: modelRow.modality,
      modelName: modelRow.modelName,
      capabilities: (modelRow.capabilities as string[]) ?? [],
      contextWindow: modelRow.contextWindow,
      enabled: modelRow.enabled,
      isMock: modelRow.isMock,
    });
  } catch (error) {
    if (error instanceof RegistryError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: error.code === "needs-key" ? 409 : 400 },
      );
    }
    throw error;
  }

  // Budget gate before any provider work: the batch is the estimate.
  const prices: PriceRow[] = (
    await db.select().from(schema.modelPrices).where(eq(schema.modelPrices.modelId, pass.modelId))
  ).map((row) => ({
    modelId: row.modelId,
    effectiveFrom: row.effectiveFrom,
    inputPerMtok: row.inputPerMtok,
    outputPerMtok: row.outputPerMtok,
    perImage: row.perImage,
    perVideoSecond: row.perVideoSecond,
  }));
  const price = priceEffectiveAt(prices, new Date());
  const estimate = price?.perImage ? Number(price.perImage) * pass.batchSize : 0;
  const decision = budgetDecision(await spendTodayUsd(session.user.id), await budgetCapUsd(session.user.id), estimate);
  if (!decision.allowed) {
    return Response.json(
      {
        error: "budget-exceeded",
        message:
          `Daily budget: $${decision.spentUsd.toFixed(2)} spent of the $${decision.capUsd.toFixed(2)} cap; ` +
          `this run estimates $${decision.estimateUsd.toFixed(4)}. Adjust the cap on the Usage page.`,
      },
      { status: 402 },
    );
  }

  const settings = (pass.settings ?? {}) as { aspect?: string; seed?: number | null };
  const size = sizeForAspect(settings.aspect);
  const baseSeed = typeof settings.seed === "number" ? settings.seed : 0;

  await db
    .update(schema.passes)
    .set({ status: "running", error: null, updatedAt: new Date() })
    .where(eq(schema.passes.id, pass.id));

  // Append-only regenerate: prior assets step aside for history.
  if (pass.status === "completed" || pass.status === "failed") {
    await db
      .update(schema.assets)
      .set({ isActive: false })
      .where(and(eq(schema.assets.passId, pass.id), eq(schema.assets.isActive, true)));
  }

  try {
    for (let slot = 0; slot < pass.batchSize; slot++) {
      const seed = baseSeed + slot;
      const { image } = await generateImage({
        model: imageModel,
        prompt: pass.prompt,
        size,
        seed,
      });
      const bytes = image.uint8Array;
      const { key } = await storage.put(bytes, "image/png");
      // Dimensions from the PNG header when the SDK result omits them.
      const [width, height] = pngDimensions(bytes) ?? [null, null];
      await db.insert(schema.assets).values({
        id: crypto.randomUUID(),
        passId: pass.id,
        storageKey: key,
        mime: "image/png",
        width,
        height,
        seed,
        isActive: true,
      });
    }

    await db
      .update(schema.passes)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(schema.passes.id, pass.id));
    await writeUsageEvent({
      userId: session.user.id,
      modelId: pass.modelId,
      kind: "image",
      inputTokens: 0,
      outputTokens: 0,
      imageCount: pass.batchSize,
    });
    await touchProject(project.id);

    return Response.json({ status: "completed", batchSize: pass.batchSize });
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation failed";
    await db
      .update(schema.passes)
      .set({ status: "failed", error: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(schema.passes.id, pass.id));
    return Response.json({ status: "failed", error: message }, { status: 502 });
  }
}

/** Reads width and height from a PNG IHDR chunk, or null when not a PNG. */
function pngDimensions(bytes: Uint8Array): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    return null;
  }
  return [view.getUint32(16), view.getUint32(20)];
}
