"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { logReviewActivity, setAssetReview } from "@/lib/studio/queries";
import { db } from "@/db";
import { schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Review decisions: approve, reject, or reset to pending. Gating reads the
 * live status, so a reversal re-arms eligibility immediately.
 */
export async function reviewAsset(assetId: string, review: "approved" | "rejected" | "pending") {
  const session = await requireSession();
  await setAssetReview(session.user.id, assetId, review);
  const [row] = await db
    .select({ projectId: schema.projects.id })
    .from(schema.assets)
    .innerJoin(schema.passes, eq(schema.passes.id, schema.assets.passId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.passes.projectId))
    .where(eq(schema.assets.id, assetId))
    .limit(1);
  if (row) {
    await logReviewActivity(row.projectId, assetId, review);
  }
  revalidatePath("/studio");
}
