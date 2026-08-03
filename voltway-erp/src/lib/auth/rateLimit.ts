import { RATE_LIMIT } from '@/lib/config';

type Bucket = { count: number; resetAt: number };

/** In-memory sliding fixed window — fine for single-instance Phase 1; swap for Redis later */
const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterSec: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = RATE_LIMIT.windowMs,
  now: number = Date.now()
): RateLimitResult {
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec,
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
  };
}

export function resetRateLimitStore(): void {
  buckets.clear();
}

export function enforceHugoRateLimits(userId: string, ip: string): RateLimitResult {
  const userResult = checkRateLimit(
    `user:${userId}`,
    RATE_LIMIT.perUserPerMinute
  );
  if (!userResult.allowed) return userResult;

  const ipResult = checkRateLimit(`ip:${ip}`, RATE_LIMIT.perIpPerMinute);
  if (!ipResult.allowed) return ipResult;

  return userResult;
}
