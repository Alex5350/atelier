import "server-only";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { availability, type ModelRow } from "./registry";
import { liveProviderStatuses } from "./server";

export type ModelView = ModelRow & {
  status: ReturnType<typeof availability>;
  priceSummary: string | null;
};

/**
 * The registry list every surface reads: model rows joined with their latest
 * price row and live availability. Ordered by modality then display name so
 * the admin table groups naturally.
 */
export async function listModelViews(): Promise<ModelView[]> {
  const statuses = liveProviderStatuses();
  const rows = await db.select().from(schema.models).orderBy(schema.models.modality, schema.models.displayName);
  const prices = await db.select().from(schema.modelPrices).orderBy(desc(schema.modelPrices.effectiveFrom));

  const byModel = new Map<string, typeof prices>();
  for (const price of prices) {
    const list = byModel.get(price.modelId) ?? [];
    list.push(price);
    byModel.set(price.modelId, list);
  }

  return rows.map((row) => {
    const latest = byModel.get(row.id)?.at(0) ?? null;
    const summary = latest
      ? [
          latest.inputPerMtok ? `$${Number(latest.inputPerMtok).toFixed(2)}/Mtok in` : null,
          latest.outputPerMtok ? `$${Number(latest.outputPerMtok).toFixed(2)}/Mtok out` : null,
          latest.perImage ? `$${Number(latest.perImage).toFixed(3)}/image` : null,
          latest.perVideoSecond ? `$${Number(latest.perVideoSecond).toFixed(2)}/s` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : null;
    return {
      id: row.id,
      displayName: row.displayName,
      provider: row.provider,
      modality: row.modality,
      modelName: row.modelName,
      capabilities: (row.capabilities as string[]) ?? [],
      contextWindow: row.contextWindow,
      enabled: row.enabled,
      isMock: row.isMock,
      status: availability(
        {
          id: row.id,
          displayName: row.displayName,
          provider: row.provider,
          modality: row.modality,
          modelName: row.modelName,
          capabilities: (row.capabilities as string[]) ?? [],
          contextWindow: row.contextWindow,
          enabled: row.enabled,
          isMock: row.isMock,
        },
        statuses,
      ),
      priceSummary: summary && summary.length > 0 ? summary : null,
    };
  });
}
