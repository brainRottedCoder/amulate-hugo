export type UserRole = 'viewer' | 'warehouse' | 'procurement' | 'admin';

export const USER_ROLES: UserRole[] = ['viewer', 'warehouse', 'procurement', 'admin'];

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  tenantId: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export type HugoPermission =
  | 'hugo:chat'
  | 'hugo:mutate_stock'
  | 'hugo:mutate_orders'
  | 'hugo:mutate_materials'
  | 'hugo:delete'
  | 'hugo:email'
  | 'admin';
