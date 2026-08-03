import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PendingToolCall, ToolName } from '@/types/hugo';
import { PENDING_TTL_MS } from '@/types/hugo';
import type { UserRole } from '@/types/auth';

const memoryPending = new Map<string, PendingToolCall>();

export function resetMemoryPending(): void {
  memoryPending.clear();
}

export function getMemoryPending(): PendingToolCall[] {
  return [...memoryPending.values()];
}

export async function createPendingToolCall(
  input: {
    userId: string;
    role: UserRole;
    toolName: ToolName;
    args: Record<string, unknown>;
    description: string;
    requestId?: string;
  },
  mode: 'firestore' | 'memory' = 'firestore'
): Promise<PendingToolCall> {
  const now = Date.now();
  const pending: Omit<PendingToolCall, 'id'> = {
    userId: input.userId,
    role: input.role,
    toolName: input.toolName,
    args: input.args,
    description: input.description,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PENDING_TTL_MS).toISOString(),
    requestId: input.requestId,
  };

  if (mode === 'memory') {
    const id = `pending_${memoryPending.size + 1}`;
    const full = { id, ...pending };
    memoryPending.set(id, full);
    return full;
  }

  const ref = await addDoc(collection(db, 'pending_tool_calls'), pending);
  return { id: ref.id, ...pending };
}

export async function getPendingToolCall(
  id: string,
  mode: 'firestore' | 'memory' = 'firestore'
): Promise<PendingToolCall | null> {
  if (mode === 'memory') return memoryPending.get(id) || null;
  const snap = await getDoc(doc(db, 'pending_tool_calls', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<PendingToolCall, 'id'>) };
}

export async function setPendingStatus(
  id: string,
  status: PendingToolCall['status'],
  mode: 'firestore' | 'memory' = 'firestore'
): Promise<void> {
  if (mode === 'memory') {
    const p = memoryPending.get(id);
    if (p) memoryPending.set(id, { ...p, status });
    return;
  }
  await updateDoc(doc(db, 'pending_tool_calls', id), { status });
}

export function isPendingExpired(pending: PendingToolCall, now = Date.now()): boolean {
  return now > new Date(pending.expiresAt).getTime();
}
