/**
 * The pure core of the model registry: no database, no server-only imports.
 * Everything here is a function of a plain model row plus an environment
 * record, so the availability and cost rules are unit-testable in isolation
 * and shared verbatim by the server resolution layer.
 */

export type ProviderId = "anthropic" | "openai" | "google" | "mock";
export type Modality = "text" | "image" | "video" | "embedding";

/** The minimal shape of a registry row this layer reasons about. */
export type ModelRow = {
  id: string;
  displayName: string;
  provider: ProviderId;
  modality: Modality;
  modelName: string;
  capabilities: string[];
  contextWindow: number | null;
  enabled: boolean;
  isMock: boolean;
};

/** The minimal shape of an effective-dated price row. */
export type PriceRow = {
  modelId: string;
  effectiveFrom: Date;
  inputPerMtok: string | null;
  outputPerMtok: string | null;
  perImage: string | null;
  perVideoSecond: string | null;
};

/** Which environment variable gates each provider. The mock provider needs none. */
export const PROVIDER_ENV: Record<ProviderId, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  mock: null,
};

export type ProviderStatus = {
  provider: ProviderId;
  configured: boolean;
  missingEnvVar: string | null;
};

/** Computes provider configured states from an environment record. */
export function providerStatuses(env: Record<string, string | undefined>): ProviderStatus[] {
  return (Object.keys(PROVIDER_ENV) as ProviderId[]).map((provider) => {
    const envVar = PROVIDER_ENV[provider];
    if (envVar === null) {
      return { provider, configured: true, missingEnvVar: null };
    }
    const configured = Boolean(env[envVar] && env[envVar]!.trim().length > 0);
    return { provider, configured, missingEnvVar: configured ? null : envVar };
  });
}

export type Availability =
  | { status: "available" }
  | { status: "disabled" }
  | { status: "needs-key"; missingEnvVar: string };

/**
 * A model is usable when it is enabled and its provider is either the built-in
 * mock (always available; that is the zero-key demo guarantee) or has its API
 * key present in the environment.
 */
export function availability(model: ModelRow, statuses: ProviderStatus[]): Availability {
  if (!model.enabled) {
    return { status: "disabled" };
  }
  const status = statuses.find((entry) => entry.provider === model.provider);
  if (!status || status.configured) {
    return { status: "available" };
  }
  return { status: "needs-key", missingEnvVar: status.missingEnvVar! };
}

export type TextUsage = { inputTokens: number; outputTokens: number };
export type ImageUsage = { imageCount: number };
export type VideoUsage = { seconds: number };

export type CostableUsage =
  | ({ kind: "text" } & TextUsage)
  | ({ kind: "image" } & ImageUsage)
  | ({ kind: "video" } & VideoUsage)
  | { kind: "embedding"; inputTokens: number };

/**
 * Cost is an estimate from the model's registered prices, never a billing
 * truth. Prices are per million tokens for text and embedding, per image, and
 * per second of video; null prices mean the quantity is not billed for that
 * model (mock models carry zero prices by construction).
 */
export function computeCost(price: PriceRow, usage: CostableUsage): number {
  switch (usage.kind) {
    case "text":
    case "embedding": {
      const input = price.inputPerMtok ? Number(price.inputPerMtok) : 0;
      const output = price.outputPerMtok ? Number(price.outputPerMtok) : 0;
      const outTokens = usage.kind === "text" ? usage.outputTokens : 0;
      return (
        (usage.inputTokens / 1_000_000) * input + (outTokens / 1_000_000) * output
      );
    }
    case "image": {
      const perImage = price.perImage ? Number(price.perImage) : 0;
      return usage.imageCount * perImage;
    }
    case "video": {
      const perSecond = price.perVideoSecond ? Number(price.perVideoSecond) : 0;
      return usage.seconds * perSecond;
    }
  }
}

/** Picks the price row in effect at a moment; callers pass rows sorted or unsorted. */
export function priceEffectiveAt(prices: PriceRow[], at: Date): PriceRow | null {
  let best: PriceRow | null = null;
  for (const price of prices) {
    if (price.effectiveFrom <= at && (best === null || price.effectiveFrom > best.effectiveFrom)) {
      best = price;
    }
  }
  return best;
}
