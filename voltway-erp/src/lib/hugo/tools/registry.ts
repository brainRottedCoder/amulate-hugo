import {
  createMaterialTool,
  deleteRecordTool,
  markOrderDeliveredTool,
  sendReorderEmailTool,
  updateStockTool,
} from '@/lib/hugo/tools/mutate_tools';
import {
  queryInventoryTool,
  queryOrdersTool,
  querySuppliersTool,
} from '@/lib/hugo/tools/query_tools';
import type { HugoToolDefinition } from '@/lib/hugo/tools/types';
import type { ToolName } from '@/types/hugo';
import type { UserRole } from '@/types/auth';
import { PolicyError } from '@/lib/auth/rbac';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const HUGO_TOOLS: HugoToolDefinition[] = [
  queryInventoryTool,
  querySuppliersTool,
  queryOrdersTool,
  updateStockTool,
  createMaterialTool,
  markOrderDeliveredTool,
  sendReorderEmailTool,
  deleteRecordTool,
];

const byName = new Map(HUGO_TOOLS.map((t) => [t.name, t]));

export function getTool(name: ToolName): HugoToolDefinition {
  const t = byName.get(name);
  if (!t) throw new Error(`Unknown tool: ${name}`);
  return t;
}

export function listTools(): HugoToolDefinition[] {
  return HUGO_TOOLS;
}

export function isMutatingTool(name: ToolName): boolean {
  return getTool(name).kind === 'mutate';
}

export function assertToolRole(toolName: ToolName, role: UserRole): void {
  const toolDef = getTool(toolName);
  if (!toolDef.roles.includes(role)) {
    throw new PolicyError(`Role '${role}' cannot use tool '${toolName}'`);
  }
}

/** LangChain tool wrappers for bindTools (execute is stubbed — orchestrator runs real execute) */
export function toLangChainTools() {
  return HUGO_TOOLS.map((def) =>
    tool(
      async () => {
        return 'deferred';
      },
      {
        name: def.name,
        description: def.description,
        schema: def.schema as z.ZodObject<z.ZodRawShape>,
      }
    )
  );
}

export function parseToolArgs(
  name: ToolName,
  raw: unknown
): Record<string, unknown> {
  const def = getTool(name);
  return def.schema.parse(raw ?? {}) as Record<string, unknown>;
}
