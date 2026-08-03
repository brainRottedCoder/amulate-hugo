# ADR 0004 — RAG provider choice (Phase 4)

## Status
Accepted

## Context
Hugo previously dumped the full materials catalog into every prompt (`databaseContext.jsonData`). At 5k–10k+ parts that blows token budgets and latency even with MiniMax M3’s large window. We need retrieve-then-hydrate, not blind dumps.

## Decision
- **Vector index:** In-process cosine index persisted to Firestore collections `material_embeddings` and `doc_chunks` (no Pinecone/Qdrant required for Voltway’s current scale).
- **Embeddings:** Deterministic local hashing embedder (`src/lib/hugo/retrieval/embed.ts`) with synonym expansion for offline/tests; optional Fireworks embedding model via `FIREWORKS_EMBEDDING_MODEL` when set.
- **Retrieval path:** embed query → top-k → hydrate live `materials` / `stock_levels` / `dispatch_parameters` → compact fact cards into the memory packer.
- **Flag:** `flags.hugoRag` (env `HUGO_RAG`, default **on**). When true, orchestrator omits full JSON dump (admin can pass `debugDump: true` to force dump).

## Why not Pinecone/Qdrant yet
- Zero extra vendor for interview/demo staging
- Firestore already in stack; index docs are small
- Swap surface is isolated behind `src/lib/hugo/retrieval/index.ts`

## Rollback
Set `HUGO_RAG=false` to restore dump-mode liveFacts (emergency only).
