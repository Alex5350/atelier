import { describe, expect, test } from "bun:test";
import { rateLimit, RATE_LIMITS } from "./rate-limit";

/**
 * The limiter guards cost-bearing endpoints: within-window counting,
 * refusal with an honest retry-after, rollover, and key isolation.
 */
describe("fixed-window rate limiting", () => {
  test("allows up to the limit and refuses the next hit in the same window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMITS.chat.limit; i++) {
      const decision = rateLimit("chat", "user-a", t0 + i);
      expect(decision.allowed).toBeTrue();
    }
    const refused = rateLimit("chat", "user-a", t0 + 500);
    expect(refused.allowed).toBeFalse();
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  test("the window rolls over and counting starts fresh", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < RATE_LIMITS.chat.limit; i++) {
      rateLimit("chat", "user-b", t0 + i);
    }
    expect(rateLimit("chat", "user-b", t0 + 999).allowed).toBeFalse();
    const after = rateLimit("chat", "user-b", t0 + RATE_LIMITS.chat.windowMs + 1);
    expect(after.allowed).toBeTrue();
    expect(after.remaining).toBe(RATE_LIMITS.chat.limit - 1);
  });

  test("users and buckets are isolated from each other", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < RATE_LIMITS["video-submit"].limit; i++) {
      expect(rateLimit("video-submit", "user-c", t0 + i).allowed).toBeTrue();
    }
    expect(rateLimit("video-submit", "user-d", t0).allowed).toBeTrue();
    expect(rateLimit("upload", "user-c", t0).allowed).toBeTrue();
    expect(rateLimit("video-submit", "user-c", t0 + 999).allowed).toBeFalse();
  });

  test("remaining counts down as the window fills", () => {
    const t0 = 4_000_000;
    const first = rateLimit("upload", "user-e", t0);
    expect(first.remaining).toBe(RATE_LIMITS.upload.limit - 1);
    const second = rateLimit("upload", "user-e", t0 + 1);
    expect(second.remaining).toBe(RATE_LIMITS.upload.limit - 2);
  });
});
