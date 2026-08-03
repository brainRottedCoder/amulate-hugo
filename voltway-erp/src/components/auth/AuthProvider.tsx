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
  setAuthCookie,
  signIn as authSignIn,
  signOut as authSignOut,
  signUp as authSignUp,
  subscribeToAuth,
} from '@/lib/auth/client';
import type { AuthUser, UserRole } from '@/types/auth';

type AuthContextValue = {
  user: AuthUser | null;
  firebaseUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>('viewer');
  const [tenantId, setTenantId] = useState('default');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeToAuth(async (u) => {
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
    return () => unsub();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await authSignIn(email, password);
    const profile = await ensureUserProfile(u);
    setRole(profile.role);
    setTenantId(profile.tenantId || 'default');
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const u = await authSignUp(email, password, displayName);
      const profile = await ensureUserProfile(u, displayName);
      setRole(profile.role);
      setTenantId(profile.tenantId || 'default');
    },
    []
  );

  const signOut = useCallback(async () => {
    await authSignOut();
    setRole('viewer');
    setTenantId('default');
  }, []);

  const getIdToken = useCallback(
    async (forceRefresh = false) => {
      if (!firebaseUser) return null;
      return firebaseUser.getIdToken(forceRefresh);
    },
    [firebaseUser]
  );

  const user: AuthUser | null = useMemo(() => {
    if (!firebaseUser) return null;
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      role,
      tenantId,
    };
  }, [firebaseUser, role, tenantId]);

  const value = useMemo(
    () => ({
      user,
      firebaseUser,
      loading,
      signIn,
      signUp,
      signOut,
      getIdToken,
    }),
    [user, firebaseUser, loading, signIn, signUp, signOut, getIdToken]
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
