import { describe, expect, test } from "bun:test";
import {
  availability,
  computeCost,
  priceEffectiveAt,
  providerStatuses,
  type ModelRow,
  type PriceRow,
} from "./registry";

const row: ModelRow = {
  id: "openai/gpt-5.6",
  displayName: "GPT-5.6",
  provider: "openai",
  modality: "text",
  modelName: "gpt-5.6",
  capabilities: ["text"],
  contextWindow: 400_000,
  enabled: true,
  isMock: false,
};

describe("provider configuration states", () => {
  test("all providers are unconfigured with an empty environment except the built-in mock", () => {
    const statuses = providerStatuses({});
    const byProvider = Object.fromEntries(statuses.map((s) => [s.provider, s]));
    expect(byProvider.openai.configured).toBe(false);
    expect(byProvider.openai.missingEnvVar).toBe("OPENAI_API_KEY");
    expect(byProvider.anthropic.missingEnvVar).toBe("ANTHROPIC_API_KEY");
    expect(byProvider.google.missingEnvVar).toBe("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(byProvider.mock.configured).toBe(true);
    expect(byProvider.mock.missingEnvVar).toBeNull();
  });

  test("a present, non-empty key marks the provider configured", () => {
    const statuses = providerStatuses({ OPENAI_API_KEY: "sk-live" });
    expect(statuses.find((s) => s.provider === "openai")?.configured).toBe(true);
  });

  test("a blank key does not count as configured", () => {
    const statuses = providerStatuses({ OPENAI_API_KEY: "   " });
    expect(statuses.find((s) => s.provider === "openai")?.configured).toBe(false);
  });
});

describe("model availability", () => {
  test("an enabled model with its provider key present is available", () => {
    expect(availability(row, providerStatuses({ OPENAI_API_KEY: "x" }))).toEqual({ status: "available" });
  });

  test("a missing key surfaces needs-key with the exact env var", () => {
    const result = availability(row, providerStatuses({}));
    expect(result).toEqual({ status: "needs-key", missingEnvVar: "OPENAI_API_KEY" });
  });

  test("the mock model is always available regardless of environment (zero-key demo guarantee)", () => {
    const muse: ModelRow = { ...row, id: "mock/atelier-muse", provider: "mock", isMock: true };
    expect(availability(muse, providerStatuses({}))).toEqual({ status: "available" });
  });

  test("a disabled model is never available even with keys present", () => {
    expect(availability({ ...row, enabled: false }, providerStatuses({ OPENAI_API_KEY: "x" }))).toEqual({
      status: "disabled",
    });
  });
});

describe("cost estimation", () => {
  const price: PriceRow = {
    modelId: "openai/gpt-5.6",
    effectiveFrom: new Date("2026-08-30T18:00:00Z"),
    inputPerMtok: "3",
    outputPerMtok: "15",
    perImage: "0.04",
    perVideoSecond: null,
  };

  test("text cost scales input and output tokens against per-million prices", () => {
    const cost = computeCost(price, { kind: "text", inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(18, 6);
  });

  test("image cost is count times the per-image price", () => {
    expect(computeCost(price, { kind: "image", imageCount: 4 })).toBeCloseTo(0.16, 6);
  });

  test("a null price means the quantity is unbilled, not an error", () => {
    const free: PriceRow = { ...price, perImage: null };
    expect(computeCost(free, { kind: "image", imageCount: 10 })).toBe(0);
  });

  test("mock prices of zero produce exactly zero cost", () => {
    const mock: PriceRow = { ...price, inputPerMtok: "0", outputPerMtok: "0" };
    expect(computeCost(mock, { kind: "text", inputTokens: 999_999, outputTokens: 999_999 })).toBe(0);
  });
});

describe("effective-dated prices", () => {
  test("the latest price effective before the moment wins", () => {
    const old: PriceRow = { modelId: "m", effectiveFrom: new Date("2026-01-01"), inputPerMtok: "5", outputPerMtok: null, perImage: null, perVideoSecond: null };
    const newer: PriceRow = { modelId: "m", effectiveFrom: new Date("2026-06-01"), inputPerMtok: "2", outputPerMtok: null, perImage: null, perVideoSecond: null };
    const at = new Date("2026-08-30");
    const effective = priceEffectiveAt([old, newer], at);
    expect(effective?.inputPerMtok).toBe("2");
  });

  test("a price effective in the future is not used", () => {
    const future: PriceRow = { modelId: "m", effectiveFrom: new Date("2027-01-01"), inputPerMtok: "1", outputPerMtok: null, perImage: null, perVideoSecond: null };
    expect(priceEffectiveAt([future], new Date("2026-08-30"))).toBeNull();
  });
});
