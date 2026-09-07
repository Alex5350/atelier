"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";

/**
 * Toggles a model's enabled flag. Only the flag moves: prices stay rows, and
 * disabling never deletes history, so ledger rows and lineage remain
 * explainable. Authenticated operator only.
 */
export async function toggleModelEnabled(modelId: string, enabled: boolean) {
  await requireSession();
  const parsed = modelId.trim();
  if (parsed.length === 0) {
    throw new Error("model id is required");
  }
  await db.update(schema.models).set({ enabled }).where(eq(schema.models.id, parsed));
  revalidatePath("/admin");
  revalidatePath("/");
}

/**
 * Registry editing: adding a model is a form, not a commit, and edits never
 * delete history. Prices are append-only by effective date, so repricing is
 * a new row and old ledger entries stay correct.
 */
export async function createModel(input: {
  id: string;
  displayName: string;
  provider: "anthropic" | "openai" | "google" | "mock";
  modality: "text" | "image" | "video" | "embedding";
  modelName: string;
  contextWindow: number | null;
}) {
  await requireSession();
  const slug = input.id.trim().toLowerCase();
  if (!/^[a-z0-9/._-]+$/.test(slug)) {
    throw new Error("model id must be a slug like provider/name");
  }
  const { db, schema } = await import("@/db");
  await db
    .insert(schema.models)
    .values({
      id: slug,
      displayName: input.displayName.trim() || slug,
      provider: input.provider,
      modality: input.modality,
      modelName: input.modelName.trim() || slug.split("/").at(-1)!,
      capabilities: [input.modality],
      contextWindow: input.contextWindow,
      enabled: true,
      isMock: input.provider === "mock",
    })
    .onConflictDoNothing();
  revalidatePath("/admin");
}

export async function updateModelDetails(input: {
  id: string;
  displayName: string;
  modelName: string;
  contextWindow: number | null;
}) {
  await requireSession();
  const { db, schema } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  await db
    .update(schema.models)
    .set({
      displayName: input.displayName.trim(),
      modelName: input.modelName.trim(),
      contextWindow: input.contextWindow,
    })
    .where(eq(schema.models.id, input.id));
  revalidatePath("/admin");
}

export async function addPriceRow(input: {
  modelId: string;
  inputPerMtok: number | null;
  outputPerMtok: number | null;
  perImage: number | null;
  perVideoSecond: number | null;
}) {
  await requireSession();
  const { db, schema } = await import("@/db");
  await db
    .insert(schema.modelPrices)
    .values({
      id: crypto.randomUUID(),
      modelId: input.modelId,
      effectiveFrom: new Date(),
      inputPerMtok: input.inputPerMtok?.toFixed(6) ?? null,
      outputPerMtok: input.outputPerMtok?.toFixed(6) ?? null,
      perImage: input.perImage?.toFixed(6) ?? null,
      perVideoSecond: input.perVideoSecond?.toFixed(6) ?? null,
    })
    .onConflictDoNothing();
  revalidatePath("/admin");
}
