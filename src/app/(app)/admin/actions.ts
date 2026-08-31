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
