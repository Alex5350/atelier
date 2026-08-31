import { describe, expect, test } from "bun:test";
import { approxTokens, budgetDecision, estimateTextCostUsd, formatUsd } from "./core";
import type { PriceRow } from "@/lib/models/registry";

const price: PriceRow = {
  modelId: "openai/gpt-5.6",
  effectiveFrom: new Date("2026-08-30T18:00:00Z"),
  inputPerMtok: "3",
  outputPerMtok: "15",
  perImage: null,
  perVideoSecond: null,
};

describe("the daily budget gate", () => {
  test("allows a call that fits under the cap including its estimate", () => {
    expect(budgetDecision(1.5, 5, 0.2)).toEqual({ allowed: true });
  });

  test("refuses when spend plus estimate would exceed the cap", () => {
    const decision = budgetDecision(4.9, 5, 0.2);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.spentUsd).toBe(4.9);
      expect(decision.estimateUsd).toBe(0.2);
    }
  });

  test("the boundary is inclusive: spend plus estimate exactly at the cap is allowed", () => {
    expect(budgetDecision(4.8, 5, 0.2).allowed).toBe(true);
  });

  test("a zero cap refuses any nonzero estimate but allows free models", () => {
    expect(budgetDecision(0, 0, 0.01).allowed).toBe(false);
    expect(budgetDecision(0, 0, 0).allowed).toBe(true);
  });
});

describe("turn cost estimation", () => {
  test("estimates input plus assumed output tokens against effective prices", () => {
    const cost = estimateTextCostUsd([price], new Date("2026-08-31"), 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(18, 6);
  });

  test("an unpriced model estimates zero (the demo model never blocks a budget)", () => {
    expect(estimateTextCostUsd([], new Date(), 999_999, 999_999)).toBe(0);
  });
});

describe("formatting and approximation", () => {
  test("small amounts show four decimals, larger show two", () => {
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(0)).toBe("$0.00");
  });

  test("token approximation is conservative on empty input", () => {
    expect(approxTokens("")).toBe(1);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
  });
});
