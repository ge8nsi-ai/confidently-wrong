/**
 * Fixed-window, in-memory, per-IP rate limiter.
 *
 * In-memory means per serverless instance: it is a cost guard, not a security
 * control. Good enough to stop a single client hammering a public endpoint that
 * spends money on model calls.
 */

const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  now = Date.now(),
): RateLimitResult {
  // Opportunistic sweep so the map cannot grow without bound.
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return {
    ok: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

/** Best-effort client identity from proxy headers. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/** Test seam. */
export function resetRateLimits(): void {
  buckets.clear();
}
