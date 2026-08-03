/**
 * Critical parts cache helper (Phase 4).
 */

import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis';
import { CACHE_TTL, criticalPartsCacheKey } from '@/lib/cache/keys';

export type CriticalPartRow = {
  part_id: string;
  part_name: string;
  quantity_available: number;
  min_stock_level: number;
};

export async function getCachedCriticalParts(
  loader: () => Promise<CriticalPartRow[]>,
  tenantId = 'default'
): Promise<CriticalPartRow[]> {
  const key = criticalPartsCacheKey(tenantId);
  const cached = await cacheGetJson<CriticalPartRow[]>(key);
  if (cached) return cached;
  const fresh = await loader();
  await cacheSetJson(key, fresh, CACHE_TTL.criticalPartsSec);
  return fresh;
}
