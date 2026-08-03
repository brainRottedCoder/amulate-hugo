# ADR 0006 — Multi-tenant model (Phase 5)

## Status
Accepted

## Context
Voltway must isolate Company A from Company B for ERP + Hugo AI data while supporting a gradual migration from single-tenant docs.

## Decision
- `tenantId` on `users`, sessions, budgets, and new ERP writes (`withTenant()`)
- Dual-read: missing `tenantId` resolves to `default` (`resolveTenantId`)
- Server `assertTenant(resource, requester, isAdmin)` — admins may cross-tenant for support
- Firestore rules in `voltway-erp/firestore.rules` enforce `request.auth` + matching `tenantId` where present
- Provision via `scripts/provision-tenant.ts`

## Note on numbering
ADR `0005` was used for the jobs runner (Phase 4). Multi-tenant is **0006**.
