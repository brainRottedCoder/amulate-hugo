/**
 * Privacy: export / delete user data + retention (Phase 5).
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

type Mode = 'firestore' | 'memory';

type MemStore = {
  sessions: Array<{ id: string; userId: string; tenantId: string }>;
  messages: Array<{ id: string; sessionId: string; content: string; ts?: string }>;
  memories: Array<{ id: string; userId: string; text: string }>;
};

const mem: MemStore = { sessions: [], messages: [], memories: [] };

export function resetPrivacyStore(): void {
  mem.sessions = [];
  mem.messages = [];
  mem.memories = [];
}

export function seedPrivacyMemory(data: Partial<MemStore>): void {
  if (data.sessions) mem.sessions = data.sessions;
  if (data.messages) mem.messages = data.messages;
  if (data.memories) mem.memories = data.memories;
}

export async function exportUserData(
  userId: string,
  mode: Mode = 'firestore'
): Promise<Record<string, unknown>> {
  if (mode === 'memory') {
    const sessions = mem.sessions.filter((s) => s.userId === userId);
    const sessionIds = new Set(sessions.map((s) => s.id));
    return {
      userId,
      exportedAt: new Date().toISOString(),
      sessions,
      messages: mem.messages.filter((m) => sessionIds.has(m.sessionId)),
      memories: mem.memories.filter((m) => m.userId === userId),
    };
  }

  const sessionsSnap = await getDocs(
    query(collection(db, 'chat_sessions'), where('userId', '==', userId))
  );
  const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const memoriesSnap = await getDocs(
    query(collection(db, 'memories'), where('userId', '==', userId))
  );
  return {
    userId,
    exportedAt: new Date().toISOString(),
    sessions,
    memories: memoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

export async function deleteUserData(
  userId: string,
  mode: Mode = 'firestore'
): Promise<{ deletedSessions: number; deletedMemories: number }> {
  if (mode === 'memory') {
    const sessions = mem.sessions.filter((s) => s.userId === userId);
    const ids = new Set(sessions.map((s) => s.id));
    mem.sessions = mem.sessions.filter((s) => s.userId !== userId);
    mem.messages = mem.messages.filter((m) => !ids.has(m.sessionId));
    const before = mem.memories.length;
    mem.memories = mem.memories.filter((m) => m.userId !== userId);
    return {
      deletedSessions: sessions.length,
      deletedMemories: before - mem.memories.length,
    };
  }

  const sessionsSnap = await getDocs(
    query(collection(db, 'chat_sessions'), where('userId', '==', userId))
  );
  for (const d of sessionsSnap.docs) {
    await deleteDoc(doc(db, 'chat_sessions', d.id));
  }
  const memoriesSnap = await getDocs(
    query(collection(db, 'memories'), where('userId', '==', userId))
  );
  for (const d of memoriesSnap.docs) {
    await deleteDoc(doc(db, 'memories', d.id));
  }
  return {
    deletedSessions: sessionsSnap.size,
    deletedMemories: memoriesSnap.size,
  };
}

/** Retention: drop chat messages / OCR older than N days (memory mode for tests). */
export async function runRetentionJob(input: {
  olderThanDays: number;
  mode?: Mode;
  now?: Date;
}): Promise<{ purgedMessages: number }> {
  const mode = input.mode || 'firestore';
  const now = input.now || new Date();
  const cutoff = now.getTime() - input.olderThanDays * 86400_000;

  if (mode === 'memory') {
    const before = mem.messages.length;
    mem.messages = mem.messages.filter((m) => {
      const ts = m.ts ? Date.parse(m.ts) : now.getTime();
      return ts >= cutoff;
    });
    return { purgedMessages: before - mem.messages.length };
  }

  // Production: would query chat_messages by ts — stub returns 0 without full scan
  return { purgedMessages: 0 };
}
