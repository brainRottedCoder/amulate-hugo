import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetRateLimitStore } from '@/lib/auth/rateLimit';
import { AuthError } from '@/lib/auth/rbac';

vi.mock('@/lib/auth/verifyRequest', () => ({
  verifyRequest: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { verifyRequest } from '@/lib/auth/verifyRequest';
import { requireHugoAuth } from '@/lib/auth/apiGuard';
import { GET as healthGet } from '@/app/api/health/route';
import type { AuthUser } from '@/types/auth';

const mockedVerify = vi.mocked(verifyRequest);

function req(path = 'http://localhost/api/hugo') {
  return new NextRequest(path, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
  });
}

describe('integration auth + health + rate limit', () => {
  afterEach(() => {
    resetRateLimitStore();
    vi.clearAllMocks();
  });

  it('unauthenticated request → 401', async () => {
    mockedVerify.mockRejectedValueOnce(new AuthError('Missing Bearer token'));

    const result = await requireHugoAuth(req(), { permission: 'hugo:chat' });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(401);
    }
  });

  it('viewer mutate action → 403', async () => {
    const viewer: AuthUser = {
      uid: 'v1',
      email: 'v@test.com',
      displayName: 'V',
      role: 'viewer',
      tenantId: 'default',
    };
    mockedVerify.mockResolvedValue(viewer);

    const result = await requireHugoAuth(req('http://localhost/api/hugo/actions'), {
      action: 'update_stock',
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(403);
    }
  });

  it('admin allowed for mutate action', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'a1',
      email: 'a@test.com',
      displayName: 'A',
      role: 'admin',
      tenantId: 'default',
    });

    const result = await requireHugoAuth(req(), { action: 'delete' });
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.user.role).toBe('admin');
    }
  });

  it('procurement allowed for email permission', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'p1',
      email: 'p@test.com',
      displayName: 'P',
      role: 'procurement',
      tenantId: 'default',
    });

    const result = await requireHugoAuth(req(), { permission: 'hugo:email' });
    expect(result).not.toBeInstanceOf(Response);
  });

  it('GET /api/health → 200 with flags (public)', async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.flags).toMatchObject({
      hugoEnabled: true,
      hugoToolCalling: true,
      hugoMemory: true,
      hugoRag: true,
    });
  });

  it('burst requests eventually → 429', async () => {
    mockedVerify.mockResolvedValue({
      uid: 'burst',
      email: 'b@test.com',
      displayName: 'B',
      role: 'admin',
      tenantId: 'default',
    });

    let saw429 = false;
    for (let i = 0; i < 25; i++) {
      const result = await requireHugoAuth(req(), {
        permission: 'hugo:chat',
        rateLimit: true,
      });
      if (result instanceof Response && result.status === 429) {
        saw429 = true;
        expect(result.headers.get('Retry-After')).toBeTruthy();
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});
