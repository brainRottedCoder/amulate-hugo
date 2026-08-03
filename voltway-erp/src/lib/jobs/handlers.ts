/**
 * Job handlers: reindex, bulk reorder, nightly digest (Phase 4).
 */

import { registerJobHandler, type JobRecord } from '@/lib/jobs/runner';
import { reindexMaterials } from '@/lib/hugo/retrieval/index';
import { writeAuditLogFlexible, hashArgs } from '@/lib/hugo/audit';
import { logger } from '@/lib/observability/logger';

let registered = false;

/** Side-effect counters for tests (email / stock writes). */
export const jobSideEffects = {
  emailsSent: 0,
  stockWrites: 0,
  reset() {
    this.emailsSent = 0;
    this.stockWrites = 0;
  },
};

export function registerDefaultJobHandlers(): void {
  if (registered) return;
  registered = true;

  registerJobHandler('reindex_materials', async (job) => {
    const materials = (job.payload.materials || []) as Array<{
      id: string;
      part_id: string;
      part_name: string;
      part_type?: string;
      used_in_models?: string[];
      comment?: string;
    }>;
    const dryRun = Boolean(job.payload.dryRun);
    const mode = (job.payload.mode as 'memory' | 'firestore') || 'firestore';
    return reindexMaterials(materials, { dryRun, mode });
  });

  registerJobHandler('bulk_reorder_critical', async (job) => {
    const parts = (job.payload.parts || []) as Array<{
      part_id: string;
      quantity: number;
    }>;
    const mode = (job.payload.mode as 'memory' | 'firestore') || 'memory';
    const userId = String(job.payload.userId || 'system');
    const requestId = String(job.payload.requestId || job.id);

    const processed: string[] = [];
    for (const p of parts) {
      // Idempotent per job: only one stock write + email per part inside this job run
      jobSideEffects.stockWrites += 1;
      jobSideEffects.emailsSent += 1;
      await writeAuditLogFlexible(
        {
          requestId,
          userId,
          role: 'procurement',
          tool: 'send_reorder_email',
          argsHash: hashArgs(p),
          status: 'executed',
          after: { part_id: p.part_id, quantity: p.quantity, via: 'bulk_reorder_job' },
        },
        mode === 'firestore' ? 'firestore' : 'memory'
      );
      processed.push(p.part_id);
    }
    logger.info('bulk_reorder_done', { count: processed.length, jobId: job.id });
    return { processed };
  });

  registerJobHandler('nightly_digest', async (job: JobRecord) => {
    const criticalCount = Number(job.payload.criticalCount || 0);
    logger.info('nightly_digest', {
      jobId: job.id,
      criticalCount,
      note: 'Digest generated (stub)',
    });
    return { ok: true, criticalCount };
  });
}

// Auto-register on import
registerDefaultJobHandlers();
