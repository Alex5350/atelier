"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { setAssetReview } from "@/lib/studio/queries";

/**
 * Review decisions: approve, reject, or reset to pending. Gating reads the
 * live status, so a reversal re-arms eligibility immediately.
 */
export async function reviewAsset(assetId: string, review: "approved" | "rejected" | "pending") {
  await requireSession();
  await setAssetReview((await requireSession()).user.id, assetId, review);
  revalidatePath("/studio");
}
