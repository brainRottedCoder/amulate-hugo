import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetRetrievalIndex,
  setLiveStock,
  upsertMaterialEmbedding,
  reindexMaterials,
} from '@/lib/hugo/retrieval/index';
import { retrieveFactCards, estimateDumpTokens } from '@/lib/hugo/retrieval/search';
import { ingestDocumentText } from '@/lib/hugo/retrieval/docs';
import { searchDocChunks } from '@/lib/hugo/retrieval/index';
import {
  cacheGetJson,
  cacheSetJson,
  resetCacheStats,
  getCacheStats,
} from '@/lib/cache/redis';
import { criticalPartsCacheKey, CACHE_TTL } from '@/lib/cache/keys';
import { invalidateCachesForMutation } from '@/lib/cache/invalidate';
import { getCachedCriticalParts } from '@/lib/cache/criticalParts';
import {
  enqueueJob,
  resetJobs,
  getMemoryJobs,
} from '@/lib/jobs/runner';
import { jobSideEffects } from '@/lib/jobs/handlers';
import '@/lib/jobs/handlers';
import { shouldIncludeCatalogDump } from '@/lib/hugo/orchestrator';
import { flags } from '@/lib/config';

const MODE = 'memory' as const;

describe('retrieval integration', () => {
  afterEach(() => {
    resetRetrievalIndex();
    resetCacheStats();
    resetJobs();
    jobSideEffects.reset();
  });

  it('synonym/semantic query returns expected part', async () => {
    await upsertMaterialEmbedding(
      {
        id: '1',
        part_id: 'P305',
        part_name: 'S1 V2 Li-Po 48V 12Ah Battery Pack',
        part_type: 'assembly',
        comment: 'main traction battery',
      },
      MODE
    );
    await upsertMaterialEmbedding(
      {
        id: '2',
        part_id: 'P304',
        part_name: 'S1 V2 750W Brushless Motor',
        part_type: 'assembly',
      },
      MODE
    );
    await setLiveStock(
      { part_id: 'P305', quantity_available: 24, min_stock_level: 50, location: 'WH3' },
      MODE
    );

    const { cards } = await retrieveFactCards({
      query: 'battery pack low stock',
      mode: MODE,
      topK: 3,
    });

    expect(cards.some((c) => c.partId === 'P305')).toBe(true);
    const stockCard = cards.find((c) => c.kind === 'stock' && c.partId === 'P305');
    expect(stockCard?.body).toMatch(/qty=24/);
  });

  it('hydration returns live stock not stale embedding-only fields', async () => {
    await upsertMaterialEmbedding(
      {
        id: '1',
        part_id: 'P305',
        part_name: 'Battery Pack',
      },
      MODE
    );
    await setLiveStock(
      { part_id: 'P305', quantity_available: 7, min_stock_level: 40, location: 'WH1' },
      MODE
    );
    // Simulate stock change after embedding
    await setLiveStock(
      { part_id: 'P305', quantity_available: 3, min_stock_level: 40, location: 'WH1' },
      MODE
    );

    const { cards } = await retrieveFactCards({ query: 'battery', mode: MODE });
    const stock = cards.find((c) => c.kind === 'stock' && c.partId === 'P305');
    expect(stock?.body).toMatch(/qty=3/);
    expect(stock?.body).not.toMatch(/qty=7/);
  });

  it('mutation invalidates critical_parts cache', async () => {
    const key = criticalPartsCacheKey();
    await cacheSetJson(key, [{ part_id: 'P305', quantity_available: 1 }], CACHE_TTL.criticalPartsSec);
    expect(await cacheGetJson(key)).not.toBeNull();

    await invalidateCachesForMutation('update_stock');
    expect(await cacheGetJson(key)).toBeNull();
  });

  it('reindex dry-run + apply', async () => {
    const materials = [
      { id: 'a', part_id: 'P100', part_name: 'Seat' },
      { id: 'b', part_id: 'P101', part_name: 'Motor' },
    ];
    const dry = await reindexMaterials(materials, { dryRun: true, mode: MODE });
    expect(dry).toEqual({ indexed: 2, dryRun: true });

    const apply = await reindexMaterials(materials, { dryRun: false, mode: MODE });
    expect(apply.dryRun).toBe(false);
    expect(apply.indexed).toBe(2);

    const { cards } = await retrieveFactCards({ query: 'motor', mode: MODE, topK: 1 });
    expect(cards.some((c) => c.partId === 'P101')).toBe(true);
  });

  it('job retry does not double-send email / double-write stock', async () => {
    const payload = {
      parts: [{ part_id: 'P305', quantity: 50 }],
      userId: 'u1',
      requestId: 'r1',
      mode: 'memory',
    };
    const first = await enqueueJob({
      type: 'bulk_reorder_critical',
      payload,
      mode: 'memory',
    });
    expect(first.status).toBe('completed');
    expect(jobSideEffects.emailsSent).toBe(1);
    expect(jobSideEffects.stockWrites).toBe(1);

    const second = await enqueueJob({
      type: 'bulk_reorder_critical',
      payload,
      mode: 'memory',
    });
    expect(second.id).toBe(first.id);
    expect(jobSideEffects.emailsSent).toBe(1);
    expect(jobSideEffects.stockWrites).toBe(1);
    expect(getMemoryJobs()).toHaveLength(1);
  });

  it('dump mode disabled when hugoRag true', () => {
    expect(flags.hugoRag).toBe(process.env.HUGO_RAG !== 'false');
    // Default Phase 4: RAG on → dump off
    if (flags.hugoRag) {
      expect(shouldIncludeCatalogDump(false)).toBe(false);
      expect(shouldIncludeCatalogDump(true)).toBe(true);
    }
  });

  it('doc chunk RAG finds later-page content', async () => {
    const pages = Array.from({ length: 6 }, (_, i) =>
      `Page ${i + 1} content. ${i === 4 ? 'LINE_ITEM_SKU_P305_QTY_12' : 'filler text '.repeat(40)}`
    ).join('\n');
    await ingestDocumentText({
      sessionId: 'sess_pdf',
      text: pages,
      docId: 'invoice1',
      mode: MODE,
    });
    const hits = await searchDocChunks('sess_pdf', 'P305 QTY', 3, MODE);
    expect(hits.some((h) => h.text.includes('LINE_ITEM_SKU_P305_QTY_12'))).toBe(true);
  });

  it('token estimate RAG << dump baseline (≥50% reduction on large dump)', async () => {
    const materials = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      part_id: `P${i}`,
      part_name: `Part name ${i} battery motor seat display`,
      comment: 'x'.repeat(80),
    }));
    await reindexMaterials(materials, { mode: MODE });
    for (const m of materials.slice(0, 20)) {
      await setLiveStock(
        { part_id: m.part_id, quantity_available: 10, min_stock_level: 50 },
        MODE
      );
    }

    const dump = JSON.stringify(materials);
    const dumpTokens = estimateDumpTokens(dump);
    const { estimatedTokens: ragTokens } = await retrieveFactCards({
      query: 'battery pack',
      mode: MODE,
      topK: 8,
    });

    expect(dumpTokens).toBeGreaterThan(ragTokens * 2);
    expect(1 - ragTokens / dumpTokens).toBeGreaterThanOrEqual(0.5);
  });

  it('cache hit visible via stats after warm get', async () => {
    const loader = vi.fn(async () => [
      {
        part_id: 'P305',
        part_name: 'Battery',
        quantity_available: 2,
        min_stock_level: 50,
      },
    ]);
    await getCachedCriticalParts(loader);
    await getCachedCriticalParts(loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(getCacheStats().hits).toBeGreaterThanOrEqual(1);
  });
});
