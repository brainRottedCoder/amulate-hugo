import { describe, expect, it } from 'vitest';
import {
  assertCanPerformAction,
  assertPermission,
  assertRole,
  hasPermission,
  PolicyError,
} from '@/lib/auth/rbac';
import type { AuthUser, UserRole } from '@/types/auth';

function user(role: UserRole): AuthUser {
  return { uid: 'u1', email: 'a@b.com', displayName: 'A', role, tenantId: 'default' };
}

describe('rbac matrix', () => {
  const roles: UserRole[] = ['viewer', 'warehouse', 'procurement', 'admin'];

  it('viewer can chat only', () => {
    expect(hasPermission('viewer', 'hugo:chat')).toBe(true);
    expect(hasPermission('viewer', 'hugo:mutate_stock')).toBe(false);
    expect(hasPermission('viewer', 'hugo:email')).toBe(false);
    expect(hasPermission('viewer', 'hugo:delete')).toBe(false);
    expect(hasPermission('viewer', 'admin')).toBe(false);
  });

  it('warehouse can mutate stock, not email/delete', () => {
    expect(hasPermission('warehouse', 'hugo:mutate_stock')).toBe(true);
    expect(hasPermission('warehouse', 'hugo:email')).toBe(false);
    expect(hasPermission('warehouse', 'hugo:delete')).toBe(false);
  });

  it('procurement can email and materials, not delete', () => {
    expect(hasPermission('procurement', 'hugo:email')).toBe(true);
    expect(hasPermission('procurement', 'hugo:mutate_materials')).toBe(true);
    expect(hasPermission('procurement', 'hugo:delete')).toBe(false);
  });

  it('admin has all permissions', () => {
    expect(hasPermission('admin', 'hugo:delete')).toBe(true);
    expect(hasPermission('admin', 'hugo:email')).toBe(true);
    expect(hasPermission('admin', 'admin')).toBe(true);
  });

  it('assertRole denies outsiders', () => {
    expect(() => assertRole(user('viewer'), ['admin'])).toThrow(PolicyError);
    expect(() => assertRole(user('admin'), ['admin'])).not.toThrow();
  });

  it('assertPermission denies viewer mutations', () => {
    expect(() => assertPermission(user('viewer'), 'hugo:mutate_stock')).toThrow(
      PolicyError
    );
  });

  it('assertCanPerformAction maps action types', () => {
    expect(() => assertCanPerformAction(user('viewer'), 'update_stock')).toThrow(
      PolicyError
    );
    expect(() => assertCanPerformAction(user('warehouse'), 'update_stock')).not.toThrow();
    expect(() => assertCanPerformAction(user('procurement'), 'send_email')).not.toThrow();
    expect(() => assertCanPerformAction(user('viewer'), 'send_email')).toThrow(PolicyError);
    expect(() => assertCanPerformAction(user('admin'), 'delete')).not.toThrow();
  });

  it('every role can chat', () => {
    for (const role of roles) {
      expect(hasPermission(role, 'hugo:chat')).toBe(true);
    }
  });
});
