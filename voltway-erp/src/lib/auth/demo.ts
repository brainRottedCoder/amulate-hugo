import type { AuthUser } from '@/types/auth';

/** Portfolio/demo auth is on unless explicitly disabled. */
export const DEMO_AUTH_ENABLED = process.env.NEXT_PUBLIC_DEMO_AUTH !== 'false';

export const DEMO_TOKEN = 'voltway-demo';
export const DEMO_STORAGE_KEY = 'voltway_demo_auth';

export const DEMO_USER: AuthUser = {
  uid: 'demo-user',
  email: 'demo@voltway.app',
  displayName: 'Demo Admin',
  role: 'admin',
  tenantId: 'default',
};

export function isDemoAuthEnabled(): boolean {
  return DEMO_AUTH_ENABLED;
}

export function isDemoToken(token: string): boolean {
  return isDemoAuthEnabled() && token === DEMO_TOKEN;
}

export function readDemoSession(): boolean {
  if (!isDemoAuthEnabled() || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEMO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDemoSession(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (active) {
      window.localStorage.setItem(DEMO_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}
