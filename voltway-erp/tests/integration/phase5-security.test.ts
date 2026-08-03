import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertTenant, resolveTenantId } from '@/lib/auth/tenant';
import { PolicyError } from '@/lib/auth/rbac';
import {
  assertWithinBudget,
  recordTokenUsage,
  resetBudgets,
  setTenantBudgetLimit,
} from '@/lib/tenants/budgets';
import { assertEmailAllowed } from '@/lib/emailAllowlist';
import { redactPii } from '@/lib/observability/redact';
import {
  createSession,
  assertSessionOwner,
  resetMemorySessions,
} from '@/lib/hugo/memory/session';
import { NextRequest } from 'next/server';
import { resetRateLimitStore } from '@/lib/auth/rateLimit';
import {
  exportUserData,
  deleteUserData,
  resetPrivacyStore,
  seedPrivacyMemory,
  runRetentionJob,
} from '@/lib/privacy/userData';
import { startSpan, endSpan, getMetricsSnapshot, resetMetrics } from '@/lib/observability/tracing';

vi.mock('@/lib/auth/verifyRequest', () => ({
  verifyRequest: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { verifyRequest } from '@/lib/auth/verifyRequest';
import { requireAdmin } from '@/lib/auth/apiGuard';
import type { AuthUser } from '@/types/auth';

const mockedVerify = vi.mocked(verifyRequest);

function req(path: string) {
  return new NextRequest(path, {
    method: 'GET',
    headers: { Authorization: 'Bearer test' },
  });
}

describe('phase 5 security', () => {
  afterEach(() => {
    resetBudgets();
    resetMemorySessions();
    resetPrivacyStore();
    resetMetrics();
    resetRateLimitStore();
    vi.clearAllMocks();
    delete process.env.VOLTWAY_ENV;
    delete process.env.STAGE;
    delete process.env.STAGING_EMAIL_ALLOWLIST;
  });

  it('cross-tenant read attempts fail', async () => {
    expect(() => assertTenant('tenant_a', 'tenant_b')).toThrow(PolicyError);
    expect(() => assertTenant('tenant_a', 'tenant_a')).not.toThrow();
    expect(() => assertTenant('tenant_a', 'tenant_b', true)).not.toThrow();
    expect(resolveTenantId({})).toBe('default');

    const sess = await createSession('userA', 'A chat', 'memory', 'tenant_a');
    await expect(
      assertSessionOwner(sess.id, 'userA', 'memory', {
        tenantId: 'tenant_b',
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('staging email to non-allowlisted address fails', () => {
    process.env.VOLTWAY_ENV = 'staging';
    process.env.STAGING_EMAIL_ALLOWLIST = 'safe@voltway.test';
    expect(() => assertEmailAllowed('supplier@real.com')).toThrow(/Staging email blocked/);
    expect(() => assertEmailAllowed('safe@voltway.test')).not.toThrow();
  });

  it('budget hard-stop returns clear error; admin bypass works', async () => {
    await setTenantBudgetLimit('t1', 100, 'memory');
    await recordTokenUsage({ tenantId: 't1', tokens: 100, mode: 'memory' });
    await expect(
      assertWithinBudget({ tenantId: 't1', role: 'viewer', mode: 'memory' })
    ).rejects.toThrow(/budget exhausted/i);
    await expect(
      assertWithinBudget({ tenantId: 't1', role: 'admin', mode: 'memory' })
    ).resolves.toBeTruthy();
  });

  it('/api/admin as non-admin → 403', async () => {
    const viewer: AuthUser = {
      uid: 'v1',
      email: 'v@t.com',
      displayName: 'V',
      role: 'viewer',
      tenantId: 'default',
    };
    mockedVerify.mockResolvedValue(viewer);
    const result = await requireAdmin(req('http://localhost/api/admin'));
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(403);
  });

  it('admin can access admin guard', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'a1',
      email: 'a@t.com',
      displayName: 'A',
      role: 'admin',
      tenantId: 'default',
    });
    const result = await requireAdmin(req('http://localhost/api/admin'));
    expect(result).not.toBeInstanceOf(Response);
  });

  it('PII redaction strips emails and tokens', () => {
    const out = redactPii({
      email: 'person@example.com',
      note: 'Contact person@example.com or +1 555-123-4567',
      authorization: 'Bearer abc.def.ghi',
    }) as Record<string, string>;
    expect(out.email).toBe('[REDACTED]');
    expect(out.note).not.toMatch(/@/);
    expect(out.authorization).toBe('[REDACTED]');
  });

  it('privacy export/delete works', async () => {
    seedPrivacyMemory({
      sessions: [{ id: 's1', userId: 'u1', tenantId: 'default' }],
      messages: [{ id: 'm1', sessionId: 's1', content: 'hi' }],
      memories: [{ id: 'mem1', userId: 'u1', text: 'prefer ACME' }],
    });
    const exported = await exportUserData('u1', 'memory');
    expect((exported.sessions as unknown[]).length).toBe(1);
    const del = await deleteUserData('u1', 'memory');
    expect(del.deletedSessions).toBe(1);
    expect(del.deletedMemories).toBe(1);
  });

  it('retention job purges old messages', async () => {
    seedPrivacyMemory({
      messages: [
        { id: 'old', sessionId: 's', content: 'old', ts: '2020-01-01T00:00:00.000Z' },
        { id: 'new', sessionId: 's', content: 'new', ts: new Date().toISOString() },
      ],
    });
    const result = await runRetentionJob({ olderThanDays: 30, mode: 'memory' });
    expect(result.purgedMessages).toBe(1);
  });

  it('trace span recorded for request', () => {
    const span = startSpan('hugo_orchestrator', { requestId: 'r1', tenantId: 'default' });
    endSpan(span, { ok: true });
    const snap = getMetricsSnapshot();
    expect(snap.recentSpans.some((s) => s.name === 'hugo_orchestrator')).toBe(true);
  });

  it('budget soft warn path does not block under 100%', async () => {
    await setTenantBudgetLimit('t2', 100, 'memory');
    await recordTokenUsage({ tenantId: 't2', tokens: 80, mode: 'memory' });
    await expect(
      assertWithinBudget({ tenantId: 't2', role: 'viewer', mode: 'memory' })
    ).resolves.toBeTruthy();
  });
});
