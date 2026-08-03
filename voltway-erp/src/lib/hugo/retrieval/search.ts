/**
 * Retrieval service: embed → top-k → hydrate live stock → fact cards (Phase 4).
 */

import {
  hydrateStock,
  searchDocChunks,
  searchMaterialsByEmbedding,
  type LiveStock,
} from '@/lib/hugo/retrieval/index';
import { MEMORY_POLICY, estimateTokens } from '@/lib/hugo/memory/policy';
import { logger } from '@/lib/observability/logger';

export type FactCard = {
  kind: 'material' | 'stock' | 'doc_chunk' | 'stat';
  title: string;
  body: string;
  partId?: string;
  score?: number;
};

export function formatFactCards(cards: FactCard[]): string {
  if (!cards.length) return '';
  return [
    '## Retrieved facts (RAG)',
    ...cards.map(
      (c) =>
        `- [${c.kind}] ${c.title}${c.score != null ? ` (score=${c.score.toFixed(3)})` : ''}: ${c.body}`
    ),
  ].join('\n');
}

export async function retrieveFactCards(input: {
  query: string;
  sessionId?: string;
  topK?: number;
  mode?: 'firestore' | 'memory';
  includeDocChunks?: boolean;
  stats?: {
    materialsCount?: number;
    healthyCount?: number;
    lowCount?: number;
    criticalCount?: number;
  };
}): Promise<{ cards: FactCard[]; factText: string; estimatedTokens: number }> {
  const mode = input.mode || 'firestore';
  const topK = input.topK ?? 8;
  const hits = await searchMaterialsByEmbedding(input.query, topK, mode);
  const partIds = hits.map((h) => h.part_id);
  const stocks = await hydrateStock(partIds, mode);
  const stockByPart = new Map(stocks.map((s) => [s.part_id, s]));

  const cards: FactCard[] = [];

  if (input.stats) {
    cards.push({
      kind: 'stat',
      title: 'Catalog stats',
      body: `materials=${input.stats.materialsCount ?? '?'} healthy=${input.stats.healthyCount ?? '?'} low=${input.stats.lowCount ?? '?'} critical=${input.stats.criticalCount ?? '?'}`,
    });
  }

  for (const h of hits) {
    const live: LiveStock | undefined = stockByPart.get(h.part_id);
    cards.push({
      kind: 'material',
      title: `${h.part_id} ${h.part_name}`,
      body: [
        h.part_type || 'part',
        (h.used_in_models || []).join(',') || 'models:n/a',
        h.comment || '',
      ]
        .filter(Boolean)
        .join(' | '),
      partId: h.part_id,
      score: h.score,
    });
    if (live) {
      const status =
        live.min_stock_level != null
          ? live.quantity_available <= live.min_stock_level * 0.5
            ? 'critical'
            : live.quantity_available <= live.min_stock_level
              ? 'low'
              : 'healthy'
          : 'unknown';
      cards.push({
        kind: 'stock',
        title: `${h.part_id} live stock`,
        body: `qty=${live.quantity_available} loc=${live.location || '?'} min=${live.min_stock_level ?? '?'} status=${status}`,
        partId: h.part_id,
      });
    }
  }

  if (input.includeDocChunks && input.sessionId) {
    const chunks = await searchDocChunks(input.sessionId, input.query, 4, mode);
    for (const c of chunks) {
      cards.push({
        kind: 'doc_chunk',
        title: `doc chunk #${c.index}`,
        body: c.text.slice(0, 400),
        score: c.score,
      });
    }
  }

  // Soft cap fact pack size (~ OCR policy / 4)
  let factText = formatFactCards(cards);
  const maxChars = Math.min(MEMORY_POLICY.maxOcrChars, 12_000);
  if (factText.length > maxChars) {
    factText = factText.slice(0, maxChars) + '\n[retrieved facts truncated]';
  }

  const estimatedTokens = estimateTokens(factText);
  logger.info('hugo_rag_retrieve', {
    queryPreview: input.query.slice(0, 80),
    hitCount: hits.length,
    cardCount: cards.length,
    estimatedTokens,
  });

  return { cards, factText, estimatedTokens };
}

/** Token estimate helper for dump vs RAG comparison logs. */
export function estimateDumpTokens(jsonData?: string): number {
  return estimateTokens(jsonData || '');
}
