'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import {
  ensureUserProfile,
  enterDemoSession,
  setAuthCookie,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp as authSignUp,
  subscribeToAuth,
} from '@/lib/auth/client';
import { DEMO_TOKEN, DEMO_USER, isDemoAuthEnabled, readDemoSession } from '@/lib/auth/demo';
import type { AuthUser, UserRole } from '@/types/auth';

type AuthContextValue = {
  user: AuthUser | null;
  firebaseUser: User | null;
  loading: boolean;
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  enterDemo: () => void;
  signOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [demoActive, setDemoActive] = useState(false);
  const [role, setRole] = useState<UserRole>('viewer');
  const [tenantId, setTenantId] = useState('default');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoAuthEnabled() && readDemoSession()) {
      setDemoActive(true);
      setRole(DEMO_USER.role);
      setTenantId(DEMO_USER.tenantId);
      setAuthCookie(true);
      setLoading(false);
    }

    let unsub = () => {};
    const timeout = window.setTimeout(() => setLoading(false), 2000);
    try {
      unsub = subscribeToAuth(async (u) => {
        window.clearTimeout(timeout);
        if (readDemoSession()) {
          setDemoActive(true);
          setRole(DEMO_USER.role);
          setTenantId(DEMO_USER.tenantId);
          setLoading(false);
          return;
        }

        setFirebaseUser(u);
        if (u) {
          setAuthCookie(true);
          try {
            const profile = await ensureUserProfile(u);
            setRole(profile.role);
            setTenantId(profile.tenantId || 'default');
          } catch {
            setRole('viewer');
            setTenantId('default');
          }
        } else {
          setAuthCookie(false);
          setRole('viewer');
          setTenantId('default');
        }
        setLoading(false);
      });
    } catch {
      window.clearTimeout(timeout);
      if (!readDemoSession()) setLoading(false);
    }

    return () => {
      window.clearTimeout(timeout);
      unsub();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await authSignIn(email, password);
    const profile = await ensureUserProfile(u);
    setDemoActive(false);
    setRole(profile.role);
    setTenantId(profile.tenantId || 'default');
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const u = await authSignUp(email, password, displayName);
      const profile = await ensureUserProfile(u, displayName);
      setDemoActive(false);
      setRole(profile.role);
      setTenantId(profile.tenantId || 'default');
    },
    []
  );

  const enterDemo = useCallback(() => {
    enterDemoSession();
    setDemoActive(true);
    setFirebaseUser(null);
    setRole(DEMO_USER.role);
    setTenantId(DEMO_USER.tenantId);
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setDemoActive(false);
    setFirebaseUser(null);
    setRole('viewer');
    setTenantId('default');
  }, []);

  const getIdToken = useCallback(
    async (forceRefresh = false) => {
      if (demoActive || readDemoSession()) return DEMO_TOKEN;
      if (!firebaseUser) return null;
      return firebaseUser.getIdToken(forceRefresh);
    },
    [demoActive, firebaseUser]
  );

  const user: AuthUser | null = useMemo(() => {
    if (demoActive) return DEMO_USER;
    if (!firebaseUser) return null;
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      role,
      tenantId,
    };
  }, [demoActive, firebaseUser, role, tenantId]);

  const value = useMemo(
    () => ({
      user,
      firebaseUser,
      loading,
      isDemo: demoActive,
      signIn,
      signUp,
      enterDemo,
      signOut,
      getIdToken,
    }),
    [user, firebaseUser, loading, demoActive, signIn, signUp, enterDemo, signOut, getIdToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
