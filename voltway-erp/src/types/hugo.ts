import type { UserRole } from '@/types/auth';

export const TOOL_NAMES = [
  'query_inventory',
  'query_suppliers',
  'query_orders',
  'update_stock',
  'create_material',
  'mark_order_delivered',
  'send_reorder_email',
  'delete_record',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type ToolKind = 'read' | 'mutate';

export type AuditStatus =
  | 'proposed'
  | 'confirmed'
  | 'executed'
  | 'rejected'
  | 'failed';

export interface ToolResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface PendingToolCall {
  id: string;
  userId: string;
  role: UserRole;
  toolName: ToolName;
  args: Record<string, unknown>;
  description: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'expired' | 'executed';
  createdAt: string;
  expiresAt: string;
  requestId?: string;
}

export interface AuditLog {
  id?: string;
  ts: string;
  requestId: string;
  userId: string;
  role: UserRole;
  tool: ToolName | string;
  argsHash: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  status: AuditStatus;
  error?: string;
  latencyMs?: number;
  model?: string;
  promptVersion?: string;
  pendingId?: string;
}

export interface OrchestratorInput {
  message: string;
  databaseContext?: {
    materialsCount?: number;
    healthyCount?: number;
    lowCount?: number;
    criticalCount?: number;
    pendingOrders?: number;
    openSales?: number;
    supplierCount?: number;
    jsonData?: string;
  };
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  fileContext?: string;
  requestId: string;
  userId: string;
  role: UserRole;
  sessionId?: string;
  tenantId?: string;
  /** Admin/debug only: force full catalog dump even when hugoRag is on */
  debugDump?: boolean;
}

export interface OrchestratorResponse {
  response: string;
  pendingTool?: {
    pendingId: string;
    toolName: ToolName;
    args: Record<string, unknown>;
    description: string;
    expiresAt: string;
  };
  readToolResults?: Array<{ toolName: ToolName; result: ToolResult }>;
  model: string;
  provider: string;
  promptVersion: string;
  requestId: string;
  mode: 'tools' | 'legacy';
}

export const PENDING_TTL_MS = 15 * 60 * 1000;
export const MAX_TOOLS_PER_TURN = 5;
