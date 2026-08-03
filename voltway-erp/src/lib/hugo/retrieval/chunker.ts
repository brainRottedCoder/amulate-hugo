/**
 * Overlapping text chunker for OCR / document RAG (Phase 4).
 */

export type TextChunk = {
  index: number;
  text: string;
  start: number;
  end: number;
};

export function chunkText(
  text: string,
  opts?: { chunkSize?: number; overlap?: number }
): TextChunk[] {
  const chunkSize = opts?.chunkSize ?? 800;
  const overlap = opts?.overlap ?? 120;
  if (!text) return [];
  if (chunkSize <= 0) throw new Error('chunkSize must be > 0');
  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error('overlap must be >= 0 and < chunkSize');
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + chunkSize);
    chunks.push({ index, text: text.slice(start, end), start, end });
    if (end >= text.length) break;
    start = end - overlap;
    index += 1;
  }
  return chunks;
}
