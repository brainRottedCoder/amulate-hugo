/**
 * Local hashing embedder + cosine similarity (Phase 4).
 * Deterministic for tests; optional Fireworks remote embeddings later.
 */

export const EMBEDDING_DIM = 256;

const SYNONYMS: Record<string, string[]> = {
  battery: ['battery', 'pack', 'lipo', 'li-ion', 'liion', 'cell', 'power'],
  motor: ['motor', 'brushless', 'bldc', 'drive'],
  display: ['display', 'dashboard', 'lcd', 'oled', 'screen'],
  seat: ['seat', 'saddle', 'comfort'],
  critical: ['critical', 'low', 'stockout', 'shortage'],
  reorder: ['reorder', 'restock', 'purchase', 'order'],
};

function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/[\s\-_]+/)
    .filter((t) => t.length > 1);
  const expanded: string[] = [];
  for (const t of raw) {
    expanded.push(t);
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (t.includes(key) || syns.includes(t)) {
        expanded.push(...syns);
      }
    }
  }
  return expanded;
}

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % EMBEDDING_DIM;
}

/** Deterministic bag-of-hashes embedding (L2-normalized). */
export function embedText(text: string): number[] {
  const vec = new Array(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text || '');
  if (tokens.length === 0) return vec;
  for (const t of tokens) {
    vec[hashToken(t)] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

export function materialEmbedText(m: {
  part_id?: string;
  part_name?: string;
  part_type?: string;
  used_in_models?: string[];
  comment?: string;
}): string {
  return [
    m.part_id || '',
    m.part_name || '',
    m.part_type || '',
    (m.used_in_models || []).join(' '),
    m.comment || '',
  ].join(' ');
}
