import { computeCost, priceEffectiveAt, type PriceRow } from "@/lib/models/registry";

/**
 * The pure budget core: decisions are functions of numbers, so the refusal
 * boundary is unit-testable to the cent. Costs are estimates from registry
 * prices; the ledger records what we estimated, never a billing truth.
 */

export type BudgetDecision =
  | { allowed: true }
  | { allowed: false; spentUsd: number; capUsd: number; estimateUsd: number };

/**
 * The daily budget gate: a call is refused when today's recorded spend plus a
 * conservative estimate for the call about to run would exceed the cap. The
 * estimate is deliberately rounded up (see estimateTextCostUsd) so the gate
 * errs toward refusing.
 */
export function budgetDecision(
  spentUsd: number,
  capUsd: number,
  estimateUsd: number,
): BudgetDecision {
  if (spentUsd + estimateUsd > capUsd) {
    return { allowed: false, spentUsd, capUsd, estimateUsd };
  }
  return { allowed: true };
}

/**
 * A conservative cost estimate for one text call: the model's effective price
 * against the approximate input tokens plus an assumed output budget. The
 * assumption is generous on purpose: better to refuse early than overrun.
 */
export function estimateTextCostUsd(
  prices: PriceRow[],
  at: Date,
  inputTokens: number,
  assumedOutputTokens: number,
): number {
  const price = priceEffectiveAt(prices, at);
  if (!price) {
    return 0;
  }
  return computeCost(price, { kind: "text", inputTokens, outputTokens: assumedOutputTokens });
}

/** Rough token approximation shared by the estimator (~4 characters per token). */
export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function formatUsd(value: number): string {
  if (value === 0) {
    return "$0.00";
  }
  if (value < 0.01) {
    return "$" + value.toFixed(4);
  }
  return "$" + value.toFixed(2);
}
