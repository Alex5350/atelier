/**
 * Fixed-window rate limiting for the app's cost-bearing endpoints.
 *
 * Deliberately in-memory and single-node (the README's honest-scope section
 * owns that posture): a Map keyed by bucket + user id, lazily pruned. The
 * budget gate caps dollars per day; this caps request rate, so a hammering
 * client churns at most `limit` requests per window instead of as fast as
 * the network allows.
 *
 * Pure module: no server-only import, so unit tests can drive windows
 * forward with an explicit clock.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export const RATE_LIMITS = {
  chat: { limit: 30, windowMs: 60_000 },
  "pass-run": { limit: 10, windowMs: 60_000 },
  "video-submit": { limit: 5, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 60_000 },
} as const;

export type RateBucket = keyof typeof RATE_LIMITS;

const PRUNE_THRESHOLD = 10_000;

export function rateLimit(
  bucket: RateBucket,
  userId: string,
  now: number = Date.now(),
): RateDecision {
  if (windows.size > PRUNE_THRESHOLD) {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) {
        windows.delete(key);
      }
    }
  }

  const { limit, windowMs } = RATE_LIMITS[bucket];
  const key = `${bucket}:${userId}`;
  const window = windows.get(key);

  if (!window || window.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000), remaining: limit - 1 };
  }

  window.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((window.resetAt - now) / 1000));
  if (window.count > limit) {
    return { allowed: false, retryAfterSeconds, remaining: 0 };
  }
  return { allowed: true, retryAfterSeconds, remaining: limit - window.count };
}

/** The 429 to return when a decision refuses, or null when it allows. */
export function rateLimitResponse(decision: RateDecision): Response | null {
  if (decision.allowed) {
    return null;
  }
  return Response.json(
    { error: "rate-limited", retryAfterSeconds: decision.retryAfterSeconds },
    { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } },
  );
}
