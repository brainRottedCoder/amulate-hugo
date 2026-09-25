'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { isDemoAuthEnabled } from '@/lib/auth/demo';

function friendlyAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Authentication failed';
  const codeMatch = raw.match(/auth\/([a-z0-9-]+)/i);
  const code = codeMatch?.[1];

  switch (code) {
    case 'invalid-api-key':
    case 'api-key-not-valid':
      return 'Firebase is not configured on this host. Use Continue as demo.';
    case 'operation-not-allowed':
      return 'Email/password sign-in is disabled. Use Continue as demo.';
    case 'email-already-in-use':
      return 'That email already has an account. Sign in instead.';
    case 'invalid-email':
      return 'Enter a valid email address.';
    case 'weak-password':
      return 'Password must be at least 6 characters.';
    case 'invalid-credential':
    case 'wrong-password':
    case 'user-not-found':
      return 'Email or password is incorrect.';
    case 'too-many-requests':
      return 'Too many attempts. Wait a moment, or use Continue as demo.';
    default:
      break;
  }

  const cleaned = raw.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim();
  if (!cleaned || cleaned.toLowerCase() === 'error') {
    return 'Sign-in is unavailable here. Use Continue as demo to explore the app.';
  }
  return cleaned;
}

export default function LoginForm() {
  const { signIn, signUp, enterDemo } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => searchParams.get('next') || '/', [searchParams]);
  const demoEnabled = isDemoAuthEnabled();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function goNext() {
    router.replace(nextPath.startsWith('/') ? nextPath : '/');
  }

  function onDemo() {
    enterDemo();
    goNext();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim() || undefined);
      }
      goNext();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
          <span className="material-symbols-outlined text-white text-2xl">electric_scooter</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
          Voltway ERP
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Portfolio demo — explore the full operations suite
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm space-y-4">
        {demoEnabled && (
          <>
            <button
              type="button"
              data-testid="continue-demo"
              onClick={onDemo}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-medium py-2.5 shadow-lg shadow-cyan-500/20 hover:opacity-95 transition"
            >
              Continue as demo
            </button>
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              No account needed. Opens as Demo Admin so every page is visible.
            </p>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-slate-400">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              or email
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
          </>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === 'signup' && (
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40"
                placeholder="Alex Chen"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder="you@voltway.com"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition"
          >
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button
                type="button"
                className="text-cyan-600 dark:text-cyan-400 font-medium"
                onClick={() => setMode('signup')}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Have an account?{' '}
              <button
                type="button"
                className="text-cyan-600 dark:text-cyan-400 font-medium"
                onClick={() => setMode('signin')}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
