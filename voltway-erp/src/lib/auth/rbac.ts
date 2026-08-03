import type { AuthUser, HugoPermission, UserRole } from '@/types/auth';

const ROLE_PERMISSIONS: Record<UserRole, HugoPermission[]> = {
  viewer: ['hugo:chat'],
  warehouse: ['hugo:chat', 'hugo:mutate_stock'],
  procurement: [
    'hugo:chat',
    'hugo:mutate_stock',
    'hugo:mutate_orders',
    'hugo:mutate_materials',
    'hugo:email',
  ],
  admin: [
    'hugo:chat',
    'hugo:mutate_stock',
    'hugo:mutate_orders',
    'hugo:mutate_materials',
    'hugo:delete',
    'hugo:email',
    'admin',
  ],
};

export class AuthError extends Error {
  status = 401;
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthError';
  }
}

export class PolicyError extends Error {
  status = 403;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'PolicyError';
  }
}

export function hasPermission(role: UserRole, permission: HugoPermission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function assertRole(user: AuthUser, allowed: UserRole[]): void {
  if (!allowed.includes(user.role)) {
    throw new PolicyError(
      `Role '${user.role}' is not permitted. Allowed: ${allowed.join(', ')}`
    );
  }
}

export function assertPermission(user: AuthUser, permission: HugoPermission): void {
  if (!hasPermission(user.role, permission)) {
    throw new PolicyError(
      `Role '${user.role}' lacks permission '${permission}'`
    );
  }
}

/** Map Hugo action types to required permission */
export function permissionForAction(action: string): HugoPermission {
  switch (action) {
    case 'update_stock':
    case 'update':
      return 'hugo:mutate_stock';
    case 'add':
      return 'hugo:mutate_materials';
    case 'mark_delivered':
      return 'hugo:mutate_orders';
    case 'delete':
      return 'hugo:delete';
    case 'send_email':
    case 'update_all_supplier_emails':
    case 'update_supplier':
      return 'hugo:email';
    default:
      return 'hugo:mutate_materials';
  }
}

export function assertCanPerformAction(user: AuthUser, action: string): void {
  assertPermission(user, permissionForAction(action));
}
