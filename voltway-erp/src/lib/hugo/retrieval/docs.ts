/**
 * Document OCR → chunk → embed store (Phase 4).
 */

import { chunkText } from '@/lib/hugo/retrieval/chunker';
import { upsertDocChunk } from '@/lib/hugo/retrieval/index';

export async function ingestDocumentText(input: {
  sessionId: string;
  text: string;
  docId?: string;
  mode?: 'firestore' | 'memory';
}): Promise<{ chunkCount: number }> {
  const mode = input.mode || 'firestore';
  const docId = input.docId || `doc_${Date.now()}`;
  const chunks = chunkText(input.text, { chunkSize: 800, overlap: 120 });
  for (const c of chunks) {
    await upsertDocChunk(
      {
        id: `${docId}_${c.index}`,
        sessionId: input.sessionId,
        text: c.text,
        index: c.index,
      },
      mode
    );
  }
  return { chunkCount: chunks.length };
}
