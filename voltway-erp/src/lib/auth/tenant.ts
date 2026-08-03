/**
 * Multi-tenant helpers (Phase 5). See docs/adr/0006-multi-tenant-model.md
 */

import { PolicyError } from '@/lib/auth/rbac';

export const DEFAULT_TENANT_ID = 'default';

export type TenantScoped = { tenantId?: string | null };

/** Dual-read: missing tenantId → default (pre-migration docs). */
export function resolveTenantId(doc: TenantScoped | null | undefined): string {
  return (doc?.tenantId && String(doc.tenantId)) || DEFAULT_TENANT_ID;
}

export function assertTenant(
  resourceTenantId: string | null | undefined,
  requesterTenantId: string,
  isAdmin = false
): void {
  if (isAdmin) return;
  const resource = resolveTenantId({ tenantId: resourceTenantId });
  if (resource !== requesterTenantId) {
    throw new PolicyError('Forbidden: cross-tenant access denied');
  }
}

export function withTenant<T extends Record<string, unknown>>(
  data: T,
  tenantId: string
): T & { tenantId: string } {
  return { ...data, tenantId };
}
