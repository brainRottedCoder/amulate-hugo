import { describe, expect, it } from 'vitest';
import { DEMO_TOKEN, DEMO_USER, isDemoToken } from '@/lib/auth/demo';
import { AuthError } from '@/lib/auth/rbac';
import { NextRequest } from 'next/server';
import { verifyRequest } from '@/lib/auth/verifyRequest';

describe('demo auth', () => {
  it('accepts the portfolio demo token', () => {
    expect(isDemoToken(DEMO_TOKEN)).toBe(true);
    expect(isDemoToken('random')).toBe(false);
  });

  it('verifyRequest returns the demo admin for the demo bearer token', async () => {
    const request = new NextRequest('http://localhost/api/hugo', {
      headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
    });
    const user = await verifyRequest(request);
    expect(user).toEqual(DEMO_USER);
    expect(user.role).toBe('admin');
  });

  it('verifyRequest still rejects missing tokens', async () => {
    const request = new NextRequest('http://localhost/api/hugo');
    await expect(verifyRequest(request)).rejects.toBeInstanceOf(AuthError);
  });
});
