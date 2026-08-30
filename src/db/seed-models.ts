import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Seeds the model registry roster with effective-dated price estimates and
 * the built-in demo model. Idempotent: rows insert with on-conflict-do-nothing,
 * so admin edits (enabled flags, prices added later) are never clobbered by a
 * re-run. Prices are estimates for cost telemetry, not billing truth; the
 * notes column says so where it matters.
 */
type SeedModel = typeof schema.models.$inferInsert;
type SeedPrice = Omit<typeof schema.modelPrices.$inferInsert, "id" | "modelId">;

/**
 * Fixed effective instant for seeded prices: combined with the unique index on
 * (model_id, effective_from), re-running the seed is a no-op instead of
 * accumulating duplicate price rows.
 */
const SEED_EFFECTIVE_FROM = new Date("2026-08-30T18:00:00Z");

const ROSTER: Array<{ model: SeedModel; prices: SeedPrice[] }> = [
  {
    model: {
      id: "mock/atelier-muse",
      displayName: "Atelier Muse (demo)",
      provider: "mock",
      modality: "text",
      modelName: "atelier-muse",
      capabilities: ["text", "deterministic", "zero-key"],
      contextWindow: 8192,
      enabled: true,
      isMock: true,
      notes: "Built-in demo narrator: streams deterministic replies with no provider key.",
    },
    prices: [
      {
        inputPerMtok: "0",
        outputPerMtok: "0",
      },
    ],
  },
  {
    model: {
      id: "anthropic/claude-sonnet-4-5",
      displayName: "Claude Sonnet 4.5",
      provider: "anthropic",
      modality: "text",
      modelName: "claude-sonnet-4-5",
      capabilities: ["text", "vision", "tools"],
      contextWindow: 200_000,
      enabled: true,
      notes: "Price is an estimate for the usage ledger, not billing truth.",
    },
    prices: [
      { inputPerMtok: "3", outputPerMtok: "15" },
    ],
  },
  {
    model: {
      id: "openai/gpt-5.6",
      displayName: "GPT-5.6",
      provider: "openai",
      modality: "text",
      modelName: "gpt-5.6",
      capabilities: ["text", "vision", "tools"],
      contextWindow: 400_000,
      enabled: true,
      notes: "Price is an estimate for the usage ledger, not billing truth.",
    },
    prices: [
      { inputPerMtok: "1.25", outputPerMtok: "10" },
    ],
  },
  {
    model: {
      id: "google/gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      provider: "google",
      modality: "text",
      modelName: "gemini-2.5-pro",
      capabilities: ["text", "vision", "tools"],
      contextWindow: 1_000_000,
      enabled: true,
      notes: "Price is an estimate for the usage ledger, not billing truth.",
    },
    prices: [
      { inputPerMtok: "1.25", outputPerMtok: "10" },
    ],
  },
  {
    model: {
      id: "google/gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      provider: "google",
      modality: "text",
      modelName: "gemini-2.5-flash",
      capabilities: ["text", "vision", "tools"],
      contextWindow: 1_000_000,
      enabled: true,
      notes: "The exploration tier: cheap and fast for drafts the studio refines later.",
    },
    prices: [
      { inputPerMtok: "0.30", outputPerMtok: "2.50" },
    ],
  },
  {
    model: {
      id: "openai/gpt-image-1",
      displayName: "GPT Image 1",
      provider: "openai",
      modality: "image",
      modelName: "gpt-image-1",
      capabilities: ["text-to-image", "image-edit", "mask"],
      enabled: true,
      notes: "Price is an estimate for the usage ledger, not billing truth.",
    },
    prices: [
      { perImage: "0.04" },
    ],
  },
  {
    model: {
      id: "google/gemini-2.5-flash-image",
      displayName: "Gemini 2.5 Flash Image",
      provider: "google",
      modality: "image",
      modelName: "gemini-2.5-flash-image",
      capabilities: ["text-to-image", "image-edit"],
      enabled: true,
      notes: "Reference-guided generation for the passes studio (wave 3).",
    },
    prices: [
      { perImage: "0.039" },
    ],
  },
  {
    model: {
      id: "openai/text-embedding-3-small",
      displayName: "Text Embedding 3 Small",
      provider: "openai",
      modality: "embedding",
      modelName: "text-embedding-3-small",
      capabilities: ["embedding"],
      enabled: true,
      notes: "Drives file retrieval (wave 2); priced per million input tokens.",
    },
    prices: [
      { inputPerMtok: "0.02" },
    ],
  },
];

export async function seedModels() {
  for (const { model, prices } of ROSTER) {
    await db.insert(schema.models).values(model).onConflictDoNothing();
    const [row] = await db.select().from(schema.models).where(eq(schema.models.id, model.id)).limit(1);
    for (const price of prices) {
      await db
        .insert(schema.modelPrices)
        .values({ id: crypto.randomUUID(), modelId: row.id, effectiveFrom: SEED_EFFECTIVE_FROM, ...price })
        .onConflictDoNothing();
    }
  }
  console.log(`model roster ensured: ${ROSTER.length} models`);
}
