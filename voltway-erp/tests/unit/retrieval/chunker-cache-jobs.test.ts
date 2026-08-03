import { describe, expect, it } from 'vitest';
import { chunkText } from '@/lib/hugo/retrieval/chunker';
import {
  CACHE_TTL,
  criticalPartsCacheKey,
  sessionSummaryCacheKey,
  suppliersCacheKey,
} from '@/lib/cache/keys';
import { buildIdempotencyKey } from '@/lib/jobs/idempotency';

describe('chunker', () => {
  it('splits OCR into overlapping chunks correctly', () => {
    const text = 'A'.repeat(2000);
    const chunks = chunkText(text, { chunkSize: 500, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text.length).toBe(500);
    // Overlap: start of chunk1 should be end of chunk0 - overlap
    expect(chunks[1].start).toBe(400);
    expect(chunks[0].text.slice(400)).toBe(chunks[1].text.slice(0, 100));
    expect(chunks[chunks.length - 1].end).toBe(text.length);
  });
});

describe('cache key builders', () => {
  it('are stable', () => {
    expect(criticalPartsCacheKey()).toBe('vw:critical_parts:default');
    expect(criticalPartsCacheKey('t1')).toBe('vw:critical_parts:t1');
    expect(suppliersCacheKey('t1')).toBe('vw:suppliers:t1');
    expect(sessionSummaryCacheKey('sess_1')).toBe('vw:session_summary:sess_1');
    expect(CACHE_TTL.criticalPartsSec).toBeGreaterThanOrEqual(30);
    expect(CACHE_TTL.criticalPartsSec).toBeLessThanOrEqual(60);
  });
});

describe('job idempotency key', () => {
  it('is stable regardless of key order', () => {
    const a = buildIdempotencyKey('bulk_reorder_critical', {
      b: 2,
      a: 1,
      nested: { z: 1, y: 2 },
    });
    const b = buildIdempotencyKey('bulk_reorder_critical', {
      a: 1,
      nested: { y: 2, z: 1 },
      b: 2,
    });
    expect(a).toBe(b);
    expect(a.startsWith('bulk_reorder_critical:')).toBe(true);

    const c = buildIdempotencyKey('bulk_reorder_critical', { a: 1, b: 3 });
    expect(c).not.toBe(a);
  });
});
