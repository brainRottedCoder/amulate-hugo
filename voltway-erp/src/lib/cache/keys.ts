/**
 * Cache key builders (Phase 4) — must stay stable for hit-rate.
 */

export const CACHE_TTL = {
  criticalPartsSec: 45,
  suppliersSec: 10 * 60,
  sessionSummarySec: 5 * 60,
} as const;

export function criticalPartsCacheKey(tenantId = 'default'): string {
  return `vw:critical_parts:${tenantId}`;
}

export function suppliersCacheKey(tenantId = 'default'): string {
  return `vw:suppliers:${tenantId}`;
}

export function sessionSummaryCacheKey(sessionId: string): string {
  return `vw:session_summary:${sessionId}`;
}
