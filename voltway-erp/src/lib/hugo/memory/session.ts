import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  limit as fsLimit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ChatMessageDoc, ChatSession } from '@/lib/hugo/memory/policy';

type Mode = 'firestore' | 'memory';

const memSessions = new Map<string, ChatSession>();
const memMessages = new Map<string, ChatMessageDoc[]>();

export function resetMemorySessions(): void {
  memSessions.clear();
  memMessages.clear();
}

export function getMemorySessionsStore(): ChatSession[] {
  return [...memSessions.values()];
}

export function getMemoryMessagesStore(sessionId: string): ChatMessageDoc[] {
  return [...(memMessages.get(sessionId) || [])];
}

export async function createSession(
  userId: string,
  title = 'New chat',
  mode: Mode = 'firestore',
  tenantId = 'default'
): Promise<ChatSession> {
  const now = new Date().toISOString();
  const payload = {
    userId,
    tenantId,
    title,
    createdAt: now,
    updatedAt: now,
    status: 'active' as const,
  };

  if (mode === 'memory') {
    const id = `sess_${memSessions.size + 1}`;
    const session = { id, ...payload };
    memSessions.set(id, session);
    memMessages.set(id, []);
    return session;
  }

  const ref = await addDoc(collection(db, 'chat_sessions'), payload);
  return { id: ref.id, ...payload };
}

export async function listSessions(
  userId: string,
  mode: Mode = 'firestore'
): Promise<ChatSession[]> {
  if (mode === 'memory') {
    return [...memSessions.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const snap = await getDocs(
    query(
      collection(db, 'chat_sessions'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc'),
      fsLimit(50)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatSession, 'id'>) }));
}

export async function getSession(
  sessionId: string,
  mode: Mode = 'firestore'
): Promise<ChatSession | null> {
  if (mode === 'memory') return memSessions.get(sessionId) || null;
  const snap = await getDoc(doc(db, 'chat_sessions', sessionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<ChatSession, 'id'>) };
}

export async function assertSessionOwner(
  sessionId: string,
  userId: string,
  mode: Mode = 'firestore',
  opts?: { tenantId?: string; isAdmin?: boolean }
): Promise<ChatSession> {
  const session = await getSession(sessionId, mode);
  if (!session) {
    const err = new Error('Session not found');
    (err as { status?: number }).status = 404;
    throw err;
  }
  if (session.userId !== userId && !opts?.isAdmin) {
    const err = new Error('Forbidden');
    (err as { status?: number }).status = 403;
    throw err;
  }
  if (opts?.tenantId) {
    const { assertTenant } = await import('@/lib/auth/tenant');
    try {
      assertTenant(session.tenantId, opts.tenantId, Boolean(opts.isAdmin));
    } catch {
      const err = new Error('Forbidden');
      (err as { status?: number }).status = 403;
      throw err;
    }
  }
  return session;
}

export async function addMessage(
  input: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolTrace?: Record<string, unknown> | null;
  },
  mode: Mode = 'firestore'
): Promise<ChatMessageDoc> {
  const ts = new Date().toISOString();
  const payload = {
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
    toolTrace: input.toolTrace || null,
    ts,
  };

  if (mode === 'memory') {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const msg = { id, ...payload };
    const list = memMessages.get(input.sessionId) || [];
    list.push(msg);
    memMessages.set(input.sessionId, list);
    const sess = memSessions.get(input.sessionId);
    if (sess) {
      memSessions.set(input.sessionId, { ...sess, updatedAt: ts });
    }
    return msg;
  }

  const ref = await addDoc(collection(db, 'chat_messages'), payload);
  await updateDoc(doc(db, 'chat_sessions', input.sessionId), { updatedAt: ts });
  return { id: ref.id, ...payload };
}

export async function listMessages(
  sessionId: string,
  mode: Mode = 'firestore'
): Promise<ChatMessageDoc[]> {
  if (mode === 'memory') {
    return [...(memMessages.get(sessionId) || [])].sort((a, b) =>
      a.ts.localeCompare(b.ts)
    );
  }

  const snap = await getDocs(
    query(
      collection(db, 'chat_messages'),
      where('sessionId', '==', sessionId),
      orderBy('ts', 'asc'),
      fsLimit(500)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessageDoc, 'id'>) }));
}

export async function touchSessionTitle(
  sessionId: string,
  title: string,
  mode: Mode = 'firestore'
): Promise<void> {
  const updatedAt = new Date().toISOString();
  if (mode === 'memory') {
    const s = memSessions.get(sessionId);
    if (s) memSessions.set(sessionId, { ...s, title, updatedAt });
    return;
  }
  await updateDoc(doc(db, 'chat_sessions', sessionId), { title, updatedAt });
}
