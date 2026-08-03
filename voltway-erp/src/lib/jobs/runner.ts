/**
 * In-process durable job runner (Phase 4). See ADR 0005.
 */

import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { buildIdempotencyKey } from '@/lib/jobs/idempotency';
import { logger } from '@/lib/observability/logger';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'dead';

export type JobRecord = {
  id: string;
  type: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

type Mode = 'firestore' | 'memory';
type Handler = (job: JobRecord) => Promise<unknown>;

const memJobs = new Map<string, JobRecord>();
const handlers = new Map<string, Handler>();

export function resetJobs(): void {
  memJobs.clear();
}

export function registerJobHandler(type: string, handler: Handler): void {
  handlers.set(type, handler);
}

export function getMemoryJobs(): JobRecord[] {
  return [...memJobs.values()];
}

async function findByIdempotencyKey(
  key: string,
  mode: Mode
): Promise<JobRecord | null> {
  if (mode === 'memory') {
    return [...memJobs.values()].find((j) => j.idempotencyKey === key) || null;
  }
  const snap = await getDocs(
    query(collection(db, 'jobs'), where('idempotencyKey', '==', key))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<JobRecord, 'id'>) };
}

export async function enqueueJob(input: {
  type: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  mode?: Mode;
  /** Skip run — enqueue only */
  defer?: boolean;
}): Promise<JobRecord> {
  const mode = input.mode || 'firestore';
  const idempotencyKey = buildIdempotencyKey(input.type, input.payload);
  const existing = await findByIdempotencyKey(idempotencyKey, mode);
  if (existing) {
    logger.info('job_idempotent_hit', {
      type: input.type,
      idempotencyKey,
      status: existing.status,
    });
    // If already completed/dead, do not re-run side effects
    if (existing.status === 'completed' || existing.status === 'dead') {
      return existing;
    }
    if (existing.status === 'queued' || existing.status === 'failed') {
      return runJob(existing.id, mode);
    }
    return existing;
  }

  const now = new Date().toISOString();
  const base: Omit<JobRecord, 'id'> = {
    type: input.type,
    idempotencyKey,
    payload: input.payload,
    status: 'queued',
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    createdAt: now,
    updatedAt: now,
  };

  let job: JobRecord;
  if (mode === 'memory') {
    const id = `job_${memJobs.size + 1}`;
    job = { id, ...base };
    memJobs.set(id, job);
  } else {
    const ref = await addDoc(collection(db, 'jobs'), base);
    job = { id: ref.id, ...base };
  }

  if (input.defer) return job;
  return runJob(job.id, mode);
}

async function loadJob(id: string, mode: Mode): Promise<JobRecord | null> {
  if (mode === 'memory') return memJobs.get(id) || null;
  const snap = await getDoc(doc(db, 'jobs', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<JobRecord, 'id'>) };
}

async function saveJob(job: JobRecord, mode: Mode): Promise<void> {
  if (mode === 'memory') {
    memJobs.set(job.id, job);
    return;
  }
  const { id, ...rest } = job;
  await updateDoc(doc(db, 'jobs', id), rest);
}

export async function runJob(jobId: string, mode: Mode = 'firestore'): Promise<JobRecord> {
  let job = await loadJob(jobId, mode);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  if (job.status === 'completed') return job;

  const handler = handlers.get(job.type);
  if (!handler) {
    job = {
      ...job,
      status: 'dead',
      error: `No handler for ${job.type}`,
      updatedAt: new Date().toISOString(),
    };
    await saveJob(job, mode);
    logger.error('job_dead_letter', { jobId, type: job.type, error: job.error });
    return job;
  }

  job = {
    ...job,
    status: 'running',
    attempts: job.attempts + 1,
    updatedAt: new Date().toISOString(),
  };
  await saveJob(job, mode);

  try {
    const result = await handler(job);
    job = {
      ...job,
      status: 'completed',
      result,
      error: undefined,
      updatedAt: new Date().toISOString(),
    };
    await saveJob(job, mode);
    logger.info('job_completed', { jobId, type: job.type, attempts: job.attempts });
    return job;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'job failed';
    const exhausted = job.attempts >= job.maxAttempts;
    job = {
      ...job,
      status: exhausted ? 'dead' : 'failed',
      error: message,
      updatedAt: new Date().toISOString(),
    };
    await saveJob(job, mode);
    if (exhausted) {
      logger.error('job_dead_letter', { jobId, type: job.type, error: message });
    } else {
      logger.warn('job_failed_retryable', {
        jobId,
        type: job.type,
        attempts: job.attempts,
        error: message,
      });
    }
    return job;
  }
}

/** Explicit retry for failed jobs (does not bypass completed idempotency). */
export async function retryJob(
  jobId: string,
  mode: Mode = 'firestore'
): Promise<JobRecord> {
  const job = await loadJob(jobId, mode);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (job.status === 'completed') return job;
  if (job.status === 'dead') {
    // Allow manual revive for ops
    const revived = {
      ...job,
      status: 'queued' as const,
      attempts: 0,
      updatedAt: new Date().toISOString(),
    };
    await saveJob(revived, mode);
    return runJob(jobId, mode);
  }
  return runJob(jobId, mode);
}
