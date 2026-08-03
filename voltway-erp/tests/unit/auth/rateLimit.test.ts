import { afterEach, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  resetRateLimitStore,
} from '@/lib/auth/rateLimit';

describe('rateLimit', () => {
  afterEach(() => {
    resetRateLimitStore();
  });

  it('allows requests under the limit', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit('user:a', 5, 60_000, now);
      expect(result.allowed).toBe(true);
    }
  });

  it('rejects when over the limit', () => {
    const now = 2_000_000;
    for (let i = 0; i < 3; i++) {
      checkRateLimit('user:b', 3, 60_000, now);
    }
    const blocked = checkRateLimit('user:b', 3, 60_000, now);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it('resets after the window', () => {
    const now = 3_000_000;
    checkRateLimit('user:c', 1, 60_000, now);
    const blocked = checkRateLimit('user:c', 1, 60_000, now);
    expect(blocked.allowed).toBe(false);

    const after = checkRateLimit('user:c', 1, 60_000, now + 60_000);
    expect(after.allowed).toBe(true);
  });
});
