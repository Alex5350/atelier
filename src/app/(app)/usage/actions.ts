"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { setBudgetCapUsd } from "@/lib/usage/queries";

/**
 * Updates the daily budget cap. The value is clamped to a sane positive range;
 * zero is allowed on purpose (a full stop) and negative values are refused.
 */
export async function updateBudgetCap(formData: FormData) {
  await requireSession();
  const raw = Number(formData.get("dailyCap"));
  if (!Number.isFinite(raw) || raw < 0 || raw > 10_000) {
    throw new Error("daily cap must be between 0 and 10000");
  }
  await setBudgetCapUsd((await requireSession()).user.id, raw);
  revalidatePath("/usage");
  revalidatePath("/");
}
