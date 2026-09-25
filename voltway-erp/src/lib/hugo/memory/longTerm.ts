import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  where,
  limit as fsLimit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getServerStoreMode, type StoreMode } from '@/lib/storeMode';
import {
  assertMemoryOwner,
  MEMORY_POLICY,
  type LongTermMemory,
  type MemoryType,
} from '@/lib/hugo/memory/policy';

type Mode = StoreMode;

const memLTM = new Map<string, LongTermMemory>();

export function resetLongTermMemories(): void {
  memLTM.clear();
}

export function getLongTermMemoriesStore(): LongTermMemory[] {
  return [...memLTM.values()];
}

export async function createLongTermMemory(
  input: {
    userId: string;
    text: string;
    type?: MemoryType;
    importance?: number;
    sourceSessionId?: string;
  },
  mode: Mode = getServerStoreMode()
): Promise<LongTermMemory> {
  const payload = {
    userId: input.userId,
    type: input.type || 'preference',
    text: input.text.trim(),
    importance: input.importance ?? 5,
    sourceSessionId: input.sourceSessionId,
    createdAt: new Date().toISOString(),
  };

  if (mode === 'memory') {
    const id = `mem_${memLTM.size + 1}`;
    const full = { id, ...payload };
    memLTM.set(id, full);
    return full;
  }

  const ref = await addDoc(collection(db, 'memories'), payload);
  return { id: ref.id, ...payload };
}

export async function listLongTermMemories(
  userId: string,
  mode: Mode = getServerStoreMode()
): Promise<LongTermMemory[]> {
  if (mode === 'memory') {
    return [...memLTM.values()]
      .filter((m) => m.userId === userId)
      .sort((a, b) => b.importance - a.importance || b.createdAt.localeCompare(a.createdAt));
  }

  const snap = await getDocs(
    query(
      collection(db, 'memories'),
      where('userId', '==', userId),
      orderBy('importance', 'desc'),
      fsLimit(50)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LongTermMemory, 'id'>) }));
}

export async function retrieveLongTermMemories(
  userId: string,
  queryText: string,
  mode: Mode = getServerStoreMode()
): Promise<LongTermMemory[]> {
  const all = await listLongTermMemories(userId, mode);
  const q = queryText.toLowerCase();
  const scored = all.map((m) => {
    const hay = m.text.toLowerCase();
    let score = m.importance;
    for (const token of q.split(/\W+/).filter((t) => t.length > 2)) {
      if (hay.includes(token)) score += 2;
    }
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MEMORY_POLICY.maxLongTermMemories).map((s) => s.m);
}

export async function deleteLongTermMemory(
  memoryId: string,
  requesterId: string,
  mode: Mode = getServerStoreMode(),
  isAdmin = false
): Promise<void> {
  if (mode === 'memory') {
    const m = memLTM.get(memoryId);
    if (!m) {
      const err = new Error('Memory not found');
      (err as { status?: number }).status = 404;
      throw err;
    }
    assertMemoryOwner(m.userId, requesterId, isAdmin);
    memLTM.delete(memoryId);
    return;
  }

  const snap = await getDocs(
    query(collection(db, 'memories'), where('__name__', '==', memoryId))
  );
  // Prefer direct doc get via id
  const { getDoc } = await import('firebase/firestore');
  const docSnap = await getDoc(doc(db, 'memories', memoryId));
  if (!docSnap.exists()) {
    const err = new Error('Memory not found');
    (err as { status?: number }).status = 404;
    throw err;
  }
  const data = docSnap.data() as LongTermMemory;
  assertMemoryOwner(data.userId, requesterId, isAdmin);
  await deleteDoc(doc(db, 'memories', memoryId));
  void snap;
}

const PREFERENCE_PATTERNS = [
  /always\s+use\s+(.+)/i,
  /prefer(?:s|ence)?\s+(.+)/i,
  /remember\s+(?:that\s+)?(.+)/i,
  /from now on,?\s+(.+)/i,
];

export function extractPreferenceCandidates(userMessage: string): string[] {
  const out: string[] = [];
  for (const p of PREFERENCE_PATTERNS) {
    const m = userMessage.match(p);
    if (m?.[1]) out.push(m[1].trim().slice(0, 240));
  }
  return out;
}

export async function maybeExtractAndStoreMemories(
  userId: string,
  userMessage: string,
  sessionId?: string,
  mode: Mode = getServerStoreMode()
): Promise<LongTermMemory[]> {
  const candidates = extractPreferenceCandidates(userMessage);
  const created: LongTermMemory[] = [];
  for (const text of candidates) {
    created.push(
      await createLongTermMemory(
        {
          userId,
          text,
          type: 'preference',
          importance: 7,
          sourceSessionId: sessionId,
        },
        mode
      )
    );
  }
  return created;
}
