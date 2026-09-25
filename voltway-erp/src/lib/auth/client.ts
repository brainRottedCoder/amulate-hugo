'use client';

/**
 * Firebase Auth client helpers (Phase 1).
 *
 * Firebase Console setup (required once):
 * 1. Open https://console.firebase.google.com → project voltway-erp
 * 2. Authentication → Sign-in method → enable Email/Password
 * 3. Create at least one user (or use Sign up on /login)
 * 4. Optionally set users/{uid}.role in Firestore to admin|procurement|warehouse|viewer
 */

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { AUTH_COOKIE_NAME } from '@/lib/config';
import { DEFAULT_TENANT_ID } from '@/lib/auth/tenant';
import { DEMO_TOKEN, readDemoSession, writeDemoSession } from '@/lib/auth/demo';
import type { UserProfile, UserRole } from '@/types/auth';

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function signIn(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(cred.user);
  setAuthCookie(true);
  return cred.user;
}

export async function signUp(email: string, password: string, displayName?: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(cred.user, displayName);
  setAuthCookie(true);
  return cred.user;
}

export async function signOut() {
  writeDemoSession(false);
  try {
    await firebaseSignOut(auth);
  } catch {
    // Demo sessions have no Firebase user.
  }
  setAuthCookie(false);
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (readDemoSession()) return DEMO_TOKEN;
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export function enterDemoSession() {
  writeDemoSession(true);
  setAuthCookie(true);
}

export function setAuthCookie(authenticated: boolean) {
  if (typeof document === 'undefined') return;
  if (authenticated) {
    document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; SameSite=Lax; max-age=${60 * 60 * 24 * 7}`;
  } else {
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; Max-Age=0`;
  }
}

export async function ensureUserProfile(
  user: User,
  displayName?: string
): Promise<UserProfile> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const now = new Date().toISOString();

  if (snap.exists()) {
    const data = snap.data() as UserProfile;
    return {
      uid: user.uid,
      email: user.email,
      displayName: data.displayName || user.displayName || displayName || null,
      role: (data.role as UserRole) || 'viewer',
      tenantId: data.tenantId || DEFAULT_TENANT_ID,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    };
  }

  const profile: UserProfile = {
    uid: user.uid,
    email: user.email,
    displayName: displayName || user.displayName || null,
    role: 'viewer',
    tenantId: DEFAULT_TENANT_ID,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(ref, profile);
  return profile;
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}
