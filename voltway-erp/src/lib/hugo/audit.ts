import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AuditLog, AuditStatus } from '@/types/hugo';
import { createHash } from 'crypto';

export function hashArgs(args: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
}

export async function writeAuditLog(
  entry: Omit<AuditLog, 'id' | 'ts'> & { ts?: string }
): Promise<string> {
  const payload: AuditLog = {
    ...entry,
    ts: entry.ts || new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, 'audit_logs'), payload);
  return ref.id;
}

export async function updateAuditStatus(
  auditId: string,
  status: AuditStatus,
  extra?: Partial<AuditLog>
): Promise<void> {
  await updateDoc(doc(db, 'audit_logs', auditId), {
    status,
    ...extra,
    ts: new Date().toISOString(),
  });
}

/** In-memory audit sink for unit/integration tests */
const memoryAudits: AuditLog[] = [];

export function resetMemoryAudits(): void {
  memoryAudits.length = 0;
}

export function getMemoryAudits(): AuditLog[] {
  return [...memoryAudits];
}

export async function writeAuditLogFlexible(
  entry: Omit<AuditLog, 'id' | 'ts'> & { ts?: string },
  mode: 'firestore' | 'memory' = 'firestore'
): Promise<string> {
  if (mode === 'memory') {
    const id = `audit_${memoryAudits.length + 1}`;
    memoryAudits.push({ id, ts: new Date().toISOString(), ...entry });
    return id;
  }
  return writeAuditLog(entry);
}

export async function getAudit(id: string): Promise<AuditLog | null> {
  const snap = await getDoc(doc(db, 'audit_logs', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<AuditLog, 'id'>) };
}
