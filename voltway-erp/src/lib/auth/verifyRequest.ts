import { NextRequest } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AuthError } from '@/lib/auth/rbac';
import { getFirebasePublicConfig } from '@/lib/config';
import { DEFAULT_TENANT_ID } from '@/lib/auth/tenant';
import type { AuthUser, UserRole } from '@/types/auth';

type LookupResponse = {
  users?: Array<{
    localId: string;
    email?: string;
    displayName?: string;
  }>;
  error?: { message?: string };
};

/**
 * Verify Firebase ID token via Identity Toolkit (no service-account JSON required).
 * Uses NEXT_PUBLIC_FIREBASE_API_KEY — same key as the web client.
 */
export async function verifyIdToken(idToken: string): Promise<{
  uid: string;
  email: string | null;
  displayName: string | null;
}> {
  const { apiKey } = getFirebasePublicConfig();
  if (!apiKey) {
    throw new AuthError('Firebase API key not configured');
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );

  const data = (await res.json()) as LookupResponse;

  if (!res.ok || !data.users?.[0]) {
    throw new AuthError(data.error?.message || 'Invalid or expired token');
  }

  const u = data.users[0];
  return {
    uid: u.localId,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
  };
}

async function resolveProfile(uid: string): Promise<{ role: UserRole; tenantId: string }> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data();
      const role = data?.role as UserRole | undefined;
      const tenantId =
        (typeof data?.tenantId === 'string' && data.tenantId) || DEFAULT_TENANT_ID;
      if (
        role === 'viewer' ||
        role === 'warehouse' ||
        role === 'procurement' ||
        role === 'admin'
      ) {
        return { role, tenantId };
      }
      return { role: 'viewer', tenantId };
    }
  } catch {
    // Fall through to default
  }
  return { role: 'viewer', tenantId: DEFAULT_TENANT_ID };
}

export async function verifyRequest(request: NextRequest): Promise<AuthUser> {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    throw new AuthError('Missing Bearer token');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new AuthError('Missing Bearer token');
  }

  const identity = await verifyIdToken(token);
  const { role, tenantId } = await resolveProfile(identity.uid);

  return {
    uid: identity.uid,
    email: identity.email,
    displayName: identity.displayName,
    role,
    tenantId,
  };
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip') || 'unknown';
}
