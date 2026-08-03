'use client';

import { useAuth } from '@/components/auth/AuthProvider';
import type { UserRole } from '@/types/auth';

export default function RoleGate({
  allow,
  children,
  fallback = null,
}: {
  allow: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || !allow.includes(user.role)) return <>{fallback}</>;
  return <>{children}</>;
}
