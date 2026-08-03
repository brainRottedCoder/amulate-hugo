/**
 * Job idempotency keys (Phase 4).
 */

import { createHash } from 'crypto';

export function buildIdempotencyKey(
  jobType: string,
  payload: Record<string, unknown>
): string {
  const stable = JSON.stringify(sortKeys(payload));
  const hash = createHash('sha256').update(`${jobType}:${stable}`).digest('hex');
  return `${jobType}:${hash.slice(0, 24)}`;
}

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sortKeys(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
