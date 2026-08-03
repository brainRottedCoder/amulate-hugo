/**
 * Redis-compatible cache with in-memory fallback (Phase 4).
 * Uses Upstash REST when UPSTASH_REDIS_REST_URL + TOKEN are set.
 */

import { logger } from '@/lib/observability/logger';

type Entry = { value: string; expiresAt: number };

const mem = new Map<string, Entry>();

let hits = 0;
let misses = 0;

export function resetCacheStats(): void {
  hits = 0;
  misses = 0;
  mem.clear();
}

export function getCacheStats(): { hits: number; misses: number; hitRate: number } {
  const total = hits + misses;
  return {
    hits,
    misses,
    hitRate: total === 0 ? 0 : hits / total,
  };
}

function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function upstashFetch(path: string[], body?: unknown): Promise<unknown> {
  const base = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const url = `${base}/${path.map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

export async function cacheGet(key: string): Promise<string | null> {
  if (upstashConfigured()) {
    try {
      const result = (await upstashFetch(['get', key])) as string | null;
      if (result == null) {
        misses += 1;
        logger.debug('cache_miss', { key, backend: 'upstash' });
        return null;
      }
      hits += 1;
      logger.info('cache_hit', { key, backend: 'upstash', ...getCacheStats() });
      return result;
    } catch (e) {
      logger.warn('cache_upstash_get_failed', {
        key,
        error: e instanceof Error ? e.message : 'err',
      });
    }
  }

  const entry = mem.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) mem.delete(key);
    misses += 1;
    logger.debug('cache_miss', { key, backend: 'memory' });
    return null;
  }
  hits += 1;
  logger.info('cache_hit', { key, backend: 'memory', ...getCacheStats() });
  return entry.value;
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSec: number
): Promise<void> {
  if (upstashConfigured()) {
    try {
      await upstashFetch(['set', key, value, 'EX', String(ttlSec)]);
      return;
    } catch (e) {
      logger.warn('cache_upstash_set_failed', {
        key,
        error: e instanceof Error ? e.message : 'err',
      });
    }
  }
  mem.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export async function cacheDel(key: string): Promise<void> {
  if (upstashConfigured()) {
    try {
      await upstashFetch(['del', key]);
    } catch (e) {
      logger.warn('cache_upstash_del_failed', {
        key,
        error: e instanceof Error ? e.message : 'err',
      });
    }
  }
  mem.delete(key);
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(
  key: string,
  value: unknown,
  ttlSec: number
): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSec);
}
