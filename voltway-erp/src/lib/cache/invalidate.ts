/**
 * Cache invalidation after audited mutations (Phase 4).
 */

import { cacheDel } from '@/lib/cache/redis';
import {
  criticalPartsCacheKey,
  sessionSummaryCacheKey,
  suppliersCacheKey,
} from '@/lib/cache/keys';
import { logger } from '@/lib/observability/logger';

const MUTATIONS_INVALIDATE_CRITICAL = new Set([
  'update_stock',
  'create_material',
  'delete_record',
  'mark_order_delivered',
]);

const MUTATIONS_INVALIDATE_SUPPLIERS = new Set([
  'delete_record',
  'create_material',
]);

export async function invalidateCachesForMutation(
  toolName: string,
  opts?: { sessionId?: string; tenantId?: string }
): Promise<void> {
  const tenant = opts?.tenantId || 'default';
  const keys: string[] = [];

  if (MUTATIONS_INVALIDATE_CRITICAL.has(toolName)) {
    keys.push(criticalPartsCacheKey(tenant));
  }
  if (MUTATIONS_INVALIDATE_SUPPLIERS.has(toolName)) {
    keys.push(suppliersCacheKey(tenant));
  }
  if (opts?.sessionId) {
    keys.push(sessionSummaryCacheKey(opts.sessionId));
  }

  await Promise.all(keys.map((k) => cacheDel(k)));
  if (keys.length) {
    logger.info('cache_invalidate', { toolName, keys });
  }
}
