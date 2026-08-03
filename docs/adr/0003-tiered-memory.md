# ADR 0003 — Tiered memory (Phase 3)

## Status
Accepted

## Context
MiniMax M3 offers a large window, but dumping unbounded history is wasteful and loses structure.

## Decision
- Soft budgets in `MEMORY_POLICY` (`src/lib/hugo/memory/policy.ts`)
- Layers: recent messages → session summary → long-term memories → live/RAG facts
- Firestore collections: `chat_sessions`, `chat_messages`, `session_summaries`, `memories`, `agent_runs`
- Packer drops oldest verbatim before summary/memories
