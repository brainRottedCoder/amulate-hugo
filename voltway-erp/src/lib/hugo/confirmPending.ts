/**
 * Confirm/reject pending Hugo tool calls (Phase 2).
 */

import { PolicyError } from '@/lib/auth/rbac';
import { assertToolRole } from '@/lib/hugo/tools/registry';
import {
  getPendingToolCall,
  isPendingExpired,
  setPendingStatus,
} from '@/lib/hugo/pending';
import { getTool, parseToolArgs } from '@/lib/hugo/tools/registry';
import { hashArgs, writeAuditLogFlexible } from '@/lib/hugo/audit';
import { PROMPT_VERSION } from '@/lib/hugo/prompts';
import type { AuthUser } from '@/types/auth';
import type { ToolResult } from '@/types/hugo';
import { invalidateCachesForMutation } from '@/lib/cache/invalidate';
import { enqueueJob } from '@/lib/jobs/runner';
import '@/lib/jobs/handlers';

export async function decidePendingTool(input: {
  pendingId: string;
  decision: 'confirm' | 'reject';
  user: AuthUser;
  requestId: string;
  storeMode?: 'firestore' | 'memory';
}): Promise<{ result?: ToolResult; message: string }> {
  const mode = input.storeMode || 'firestore';
  const pending = await getPendingToolCall(input.pendingId, mode);
  if (!pending) {
    throw Object.assign(new Error('Pending tool call not found'), { status: 404 });
  }
  if (pending.userId !== input.user.uid && input.user.role !== 'admin') {
    throw new PolicyError('Not allowed to decide this pending tool call');
  }
  if (pending.status !== 'pending') {
    throw Object.assign(new Error(`Pending call already ${pending.status}`), {
      status: 409,
    });
  }
  if (isPendingExpired(pending)) {
    await setPendingStatus(input.pendingId, 'expired', mode);
    throw Object.assign(new Error('Pending tool call expired'), { status: 409 });
  }

  assertToolRole(pending.toolName, input.user.role);
  const args = parseToolArgs(pending.toolName, pending.args);

  if (input.decision === 'reject') {
    await setPendingStatus(input.pendingId, 'rejected', mode);
    await writeAuditLogFlexible(
      {
        requestId: input.requestId,
        userId: input.user.uid,
        role: input.user.role,
        tool: pending.toolName,
        argsHash: hashArgs(args),
        status: 'rejected',
        pendingId: pending.id,
        promptVersion: PROMPT_VERSION,
      },
      mode
    );
    return { message: 'Action cancelled' };
  }

  const started = Date.now();
  const tool = getTool(pending.toolName);
  try {
    const result = await tool.execute(
      {
        userId: input.user.uid,
        role: input.user.role,
        requestId: input.requestId,
        confirmSend: pending.toolName === 'send_reorder_email',
      },
      args
    );

    if (!result.ok) {
      await setPendingStatus(input.pendingId, 'pending', mode);
      await writeAuditLogFlexible(
        {
          requestId: input.requestId,
          userId: input.user.uid,
          role: input.user.role,
          tool: pending.toolName,
          argsHash: hashArgs(args),
          status: 'failed',
          error: result.message,
          latencyMs: Date.now() - started,
          pendingId: pending.id,
          promptVersion: PROMPT_VERSION,
        },
        mode
      );
      return { result, message: result.message };
    }

    await setPendingStatus(input.pendingId, 'executed', mode);
    await writeAuditLogFlexible(
      {
        requestId: input.requestId,
        userId: input.user.uid,
        role: input.user.role,
        tool: pending.toolName,
        argsHash: hashArgs(args),
        status: 'executed',
        after: result.data || null,
        latencyMs: Date.now() - started,
        pendingId: pending.id,
        promptVersion: PROMPT_VERSION,
      },
      mode
    );

    await invalidateCachesForMutation(pending.toolName);

    // Async reindex when materials change
    if (pending.toolName === 'create_material' && result.data) {
      const partId = String(
        (result.data as { part_id?: string }).part_id ||
          (args as { part_id?: string }).part_id ||
          ''
      );
      if (partId) {
        void enqueueJob({
          type: 'reindex_materials',
          payload: {
            materials: [
              {
                id: partId,
                part_id: partId,
                part_name: String(
                  (args as { part_name?: string }).part_name || partId
                ),
                part_type: (args as { part_type?: string }).part_type,
                comment: (args as { comment?: string }).comment,
              },
            ],
            mode,
          },
          mode: mode === 'memory' ? 'memory' : 'firestore',
        }).catch(() => undefined);
      }
    }

    return { result, message: result.message };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Execution failed';
    await writeAuditLogFlexible(
      {
        requestId: input.requestId,
        userId: input.user.uid,
        role: input.user.role,
        tool: pending.toolName,
        argsHash: hashArgs(args),
        status: 'failed',
        error: message,
        latencyMs: Date.now() - started,
        pendingId: pending.id,
        promptVersion: PROMPT_VERSION,
      },
      mode
    );
    throw e;
  }
}
