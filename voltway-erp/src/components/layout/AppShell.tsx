'use client';

import { usePathname } from 'next/navigation';

export default function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen overflow-hidden flex">
      {sidebar}
      <main className="flex-1 h-screen overflow-y-auto bg-slate-50 dark:bg-slate-950 flex flex-col">
        {children}
      </main>
    </div>
  );
}
