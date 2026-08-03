/**
 * In-memory scale smoke: 5k embeddings, retrieval p95 latency + token reduction.
 * Run: npx tsx scripts/scale-smoke-rag.ts
 */
import {
  reindexMaterials,
  setLiveStock,
  resetRetrievalIndex,
} from '../src/lib/hugo/retrieval/index';
import {
  retrieveFactCards,
  estimateDumpTokens,
} from '../src/lib/hugo/retrieval/search';

async function main() {
  resetRetrievalIndex();
  const N = 5000;
  const materials = Array.from({ length: N }, (_, i) => ({
    id: String(i),
    part_id: `PX${i}`,
    part_name:
      i === 42
        ? 'Special Li-Po Battery Pack critical low'
        : `Generic Component ${i}`,
    part_type: 'component',
    comment: i === 42 ? 'battery synonym target' : '',
  }));

  console.log(`[scale] indexing ${N} materials…`);
  const t0 = Date.now();
  await reindexMaterials(materials, { mode: 'memory' });
  await setLiveStock(
    { part_id: 'PX42', quantity_available: 4, min_stock_level: 50, location: 'WH1' },
    'memory'
  );
  console.log(`[scale] index_ms=${Date.now() - t0}`);

  const dump = JSON.stringify(
    materials.map((m) => ({ ...m, stock: 100, location: 'WH1', min: 50 }))
  );
  const dumpTokens = estimateDumpTokens(dump);

  const latencies: number[] = [];
  let lastCards = 0;
  let ragTokens = 0;
  for (let i = 0; i < 20; i++) {
    const s = Date.now();
    const out = await retrieveFactCards({
      query: 'battery pack low stock',
      mode: 'memory',
      topK: 8,
    });
    latencies.push(Date.now() - s);
    lastCards = out.cards.length;
    ragTokens = out.estimatedTokens;
  }
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  const reduction = dumpTokens > 0 ? (1 - ragTokens / dumpTokens) * 100 : 0;
  console.log(
    JSON.stringify(
      {
        n: N,
        p95_ms: p95,
        ragTokens,
        dumpTokens,
        reductionPct: Math.round(reduction),
        cards: lastCards,
        pass_p95_lt_5000: p95 < 5000,
        pass_reduction_ge_50: reduction >= 50,
      },
      null,
      2
    )
  );

  if (p95 >= 5000 || reduction < 50) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
