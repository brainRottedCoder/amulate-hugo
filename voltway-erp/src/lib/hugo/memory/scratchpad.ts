import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, updateDoc, where, limit as fsLimit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getServerStoreMode } from '@/lib/storeMode';
import type { AgentRun } from '@/lib/hugo/memory/policy';

type Mode = 'firestore' | 'memory';

const memRuns = new Map<string, AgentRun>();

export function resetAgentRuns(): void {
  memRuns.clear();
}

export function getAgentRunsStore(): AgentRun[] {
  return [...memRuns.values()];
}

export async function createAgentRun(
  input: {
    userId: string;
    goal: string;
    sessionId?: string;
    steps?: AgentRun['steps'];
  },
  mode: Mode = getServerStoreMode()
): Promise<AgentRun> {
  const now = new Date().toISOString();
  const payload: Omit<AgentRun, 'id'> = {
    userId: input.userId,
    sessionId: input.sessionId,
    goal: input.goal,
    steps: input.steps || [
      { id: '1', label: 'Analyze', status: 'pending' },
      { id: '2', label: 'Act', status: 'pending' },
      { id: '3', label: 'Verify', status: 'pending' },
    ],
    status: 'running',
    createdAt: now,
    updatedAt: now,
  };

  if (mode === 'memory') {
    const id = `run_${memRuns.size + 1}`;
    const full = { id, ...payload };
    memRuns.set(id, full);
    return full;
  }

  const ref = await addDoc(collection(db, 'agent_runs'), payload);
  return { id: ref.id, ...payload };
}

export async function getAgentRun(
  runId: string,
  mode: Mode = getServerStoreMode()
): Promise<AgentRun | null> {
  if (mode === 'memory') return memRuns.get(runId) || null;
  const snap = await getDoc(doc(db, 'agent_runs', runId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<AgentRun, 'id'>) };
}

/** Latest running/paused run for a session (refresh-safe scratchpad). */
export async function getActiveAgentRunForSession(
  sessionId: string,
  userId: string,
  mode: Mode = getServerStoreMode()
): Promise<AgentRun | null> {
  if (mode === 'memory') {
    const runs = [...memRuns.values()]
      .filter(
        (r) =>
          r.sessionId === sessionId &&
          r.userId === userId &&
          (r.status === 'running' || r.status === 'paused')
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return runs[0] || null;
  }

  const snap = await getDocs(
    query(
      collection(db, 'agent_runs'),
      where('sessionId', '==', sessionId),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc'),
      fsLimit(5)
    )
  );
  const runs = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<AgentRun, 'id'>) }))
    .filter((r) => r.status === 'running' || r.status === 'paused');
  return runs[0] || null;
}

export async function updateAgentRunStep(
  runId: string,
  stepId: string,
  status: 'pending' | 'done' | 'failed',
  note?: string,
  mode: Mode = getServerStoreMode()
): Promise<AgentRun> {
  const run = await getAgentRun(runId, mode);
  if (!run) {
    const err = new Error('Agent run not found');
    (err as { status?: number }).status = 404;
    throw err;
  }
  if (run.userId && false) {
    // placeholder for ownership in callers
  }

  const steps = run.steps.map((s) =>
    s.id === stepId ? { ...s, status, note: note ?? s.note } : s
  );
  const allDone = steps.every((s) => s.status === 'done');
  const anyFailed = steps.some((s) => s.status === 'failed');
  const updated: AgentRun = {
    ...run,
    steps,
    status: anyFailed ? 'failed' : allDone ? 'completed' : 'running',
    updatedAt: new Date().toISOString(),
  };

  if (mode === 'memory') {
    memRuns.set(runId, updated);
    return updated;
  }

  await updateDoc(doc(db, 'agent_runs', runId), {
    steps: updated.steps,
    status: updated.status,
    updatedAt: updated.updatedAt,
  });
  return updated;
}
