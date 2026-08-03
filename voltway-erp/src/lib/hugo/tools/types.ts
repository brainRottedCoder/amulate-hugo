import type { UserRole } from '@/types/auth';
import type { ToolKind, ToolName, ToolResult } from '@/types/hugo';
import type { ZodTypeAny } from 'zod';

export interface ToolContext {
  userId: string;
  role: UserRole;
  requestId: string;
  /** When true, email tool may actually send */
  confirmSend?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface HugoToolDefinition<TArgs = any> {
  name: ToolName;
  description: string;
  kind: ToolKind;
  roles: UserRole[];
  schema: ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  execute: (ctx: ToolContext, args: TArgs) => Promise<ToolResult>;
}

export const ALLOWED_COLLECTIONS = [
  'materials',
  'stock_levels',
  'dispatch_parameters',
  'material_orders',
  'sales_orders',
  'suppliers',
] as const;
