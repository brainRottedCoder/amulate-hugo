'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  useEffect(() => {
    if (loading) return;
    if (!user && !isLogin) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`);
    }
    if (user && isLogin) {
      router.replace('/');
    }
  }, [user, loading, isLogin, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-slate-500 dark:text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user && !isLogin) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-slate-500 dark:text-slate-400 text-sm">Redirecting to login…</div>
      </div>
    );
  }

  return <>{children}</>;
}
