/**
 * Material / doc vector index (Phase 4).
 * Memory mode for tests; Firestore collections in production.
 */

import { doc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getServerStoreMode } from '@/lib/storeMode';
import {
  cosineSimilarity,
  embedText,
  materialEmbedText,
} from '@/lib/hugo/retrieval/embed';

export type IndexedMaterial = {
  id: string;
  part_id: string;
  part_name: string;
  part_type?: string;
  used_in_models?: string[];
  comment?: string;
  embedding: number[];
  updatedAt: string;
};

export type LiveStock = {
  part_id: string;
  quantity_available: number;
  location?: string;
  min_stock_level?: number;
  part_name?: string;
};

type Mode = 'firestore' | 'memory';

const memIndex = new Map<string, IndexedMaterial>();
const memStock = new Map<string, LiveStock>();
const memDocs = new Map<
  string,
  { id: string; sessionId: string; text: string; embedding: number[]; index: number }
>();

export function resetRetrievalIndex(): void {
  memIndex.clear();
  memStock.clear();
  memDocs.clear();
}

export function getMemoryIndexStore(): IndexedMaterial[] {
  return [...memIndex.values()];
}

export async function upsertMaterialEmbedding(
  material: {
    id: string;
    part_id: string;
    part_name: string;
    part_type?: string;
    used_in_models?: string[];
    comment?: string;
  },
  mode: Mode = getServerStoreMode()
): Promise<IndexedMaterial> {
  const embedding = embedText(materialEmbedText(material));
  const row: IndexedMaterial = {
    ...material,
    embedding,
    updatedAt: new Date().toISOString(),
  };

  if (mode === 'memory') {
    memIndex.set(material.part_id, row);
    return row;
  }

  await setDoc(doc(db, 'material_embeddings', material.part_id), {
    ...row,
    // Firestore-friendly: store embedding as number array
  });
  return row;
}

export async function setLiveStock(
  stock: LiveStock,
  mode: Mode = getServerStoreMode()
): Promise<void> {
  if (mode === 'memory') {
    memStock.set(stock.part_id, stock);
    return;
  }
  // Live stock always read from stock_levels at hydrate time in firestore mode
  void stock;
}

export async function hydrateStock(
  partIds: string[],
  mode: Mode = getServerStoreMode()
): Promise<LiveStock[]> {
  if (mode === 'memory') {
    const fromMem = partIds
      .map((id) => memStock.get(id))
      .filter((s): s is LiveStock => Boolean(s));
    if (fromMem.length) return fromMem;
    const { getCatalogRows } = await import('@/lib/catalog');
    const stock = getCatalogRows('stock_levels');
    const dispatch = getCatalogRows('dispatch_parameters');
    return partIds.map((id) => {
      const s = stock.find((r) => String(r.part_id) === id);
      const d = dispatch.find((r) => String(r.part_id) === id);
      return {
        part_id: id,
        quantity_available: Number(s?.quantity_available ?? 0),
        location: s?.location ? String(s.location) : undefined,
        part_name: s?.part_name ? String(s.part_name) : undefined,
        min_stock_level: Number(d?.min_stock_level ?? 50),
      };
    });
  }

  const { query, where, getDocs: gd, collection: col } = await import(
    'firebase/firestore'
  );
  // Firestore 'in' limited to 10 — batch
  const out: LiveStock[] = [];
  for (let i = 0; i < partIds.length; i += 10) {
    const batch = partIds.slice(i, i + 10);
    if (!batch.length) continue;
    const snap = await gd(
      query(col(db, 'stock_levels'), where('part_id', 'in', batch))
    );
    for (const d of snap.docs) {
      const data = d.data();
      out.push({
        part_id: data.part_id,
        quantity_available: Number(data.quantity_available ?? 0),
        location: data.location,
        part_name: data.part_name,
      });
    }
    const disp = await gd(
      query(col(db, 'dispatch_parameters'), where('part_id', 'in', batch))
    );
    for (const d of disp.docs) {
      const data = d.data();
      const existing = out.find((s) => s.part_id === data.part_id);
      if (existing) existing.min_stock_level = Number(data.min_stock_level ?? 50);
    }
  }
  return out;
}

export async function loadAllEmbeddings(
  mode: Mode = getServerStoreMode()
): Promise<IndexedMaterial[]> {
  if (mode === 'memory') {
    if (memIndex.size === 0) {
      const { getCatalogRows } = await import('@/lib/catalog');
      const { embedText, materialEmbedText } = await import('@/lib/hugo/retrieval/embed');
      for (const row of getCatalogRows('materials')) {
        const part_id = String(row.part_id || row.id);
        memIndex.set(part_id, {
          id: String(row.id),
          part_id,
          part_name: String(row.part_name || part_id),
          part_type: row.part_type ? String(row.part_type) : undefined,
          used_in_models: Array.isArray(row.used_in_models) ? row.used_in_models as string[] : undefined,
          comment: row.comment ? String(row.comment) : undefined,
          embedding: embedText(materialEmbedText({
            part_id,
            part_name: String(row.part_name || part_id),
            part_type: row.part_type ? String(row.part_type) : undefined,
            comment: row.comment ? String(row.comment) : undefined,
          })),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return [...memIndex.values()];
  }
  const snap = await getDocs(collection(db, 'material_embeddings'));
  return snap.docs.map((d) => d.data() as IndexedMaterial);
}

export async function searchMaterialsByEmbedding(
  queryText: string,
  topK = 8,
  mode: Mode = getServerStoreMode()
): Promise<Array<IndexedMaterial & { score: number }>> {
  const q = embedText(queryText);
  const all = await loadAllEmbeddings(mode);
  return all
    .map((m) => ({ ...m, score: cosineSimilarity(q, m.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function upsertDocChunk(
  input: {
    id: string;
    sessionId: string;
    text: string;
    index: number;
  },
  mode: Mode = getServerStoreMode()
): Promise<void> {
  const embedding = embedText(input.text);
  if (mode === 'memory') {
    memDocs.set(input.id, { ...input, embedding });
    return;
  }
  await setDoc(doc(db, 'doc_chunks', input.id), {
    ...input,
    embedding,
    updatedAt: new Date().toISOString(),
  });
}

export async function searchDocChunks(
  sessionId: string,
  queryText: string,
  topK = 4,
  mode: Mode = getServerStoreMode()
): Promise<Array<{ id: string; text: string; score: number; index: number }>> {
  const q = embedText(queryText);
  if (mode === 'memory') {
    return [...memDocs.values()]
      .filter((c) => c.sessionId === sessionId)
      .map((c) => ({
        id: c.id,
        text: c.text,
        index: c.index,
        score: cosineSimilarity(q, c.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  const { query, where, getDocs: gd, collection: col } = await import(
    'firebase/firestore'
  );
  const snap = await gd(
    query(col(db, 'doc_chunks'), where('sessionId', '==', sessionId))
  );
  return snap.docs
    .map((d) => {
      const data = d.data() as {
        text: string;
        embedding: number[];
        index: number;
      };
      return {
        id: d.id,
        text: data.text,
        index: data.index,
        score: cosineSimilarity(q, data.embedding || []),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function clearMaterialEmbeddings(mode: Mode = getServerStoreMode()): Promise<void> {
  if (mode === 'memory') {
    memIndex.clear();
    return;
  }
  const snap = await getDocs(collection(db, 'material_embeddings'));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function reindexMaterials(
  materials: Array<{
    id: string;
    part_id: string;
    part_name: string;
    part_type?: string;
    used_in_models?: string[];
    comment?: string;
  }>,
  opts?: { dryRun?: boolean; mode?: Mode }
): Promise<{ indexed: number; dryRun: boolean }> {
  const mode = opts?.mode || getServerStoreMode();
  const dryRun = Boolean(opts?.dryRun);
  if (dryRun) {
    return { indexed: materials.length, dryRun: true };
  }
  for (const m of materials) {
    await upsertMaterialEmbedding(m, mode);
  }
  return { indexed: materials.length, dryRun: false };
}
