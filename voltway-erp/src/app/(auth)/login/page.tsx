import { Suspense } from 'react';
import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <Suspense
        fallback={
          <div className="text-slate-500 text-sm">Loading login…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
