# ADR 0005 — Background jobs runner (Phase 4)

## Status
Accepted

## Context
Reindex, bulk reorder, and nightly digest must be idempotent, retryable, and auditable without double-sending email or double-writing stock.

## Decision
- **Runner:** In-process job runner at `src/lib/jobs/*` with durable job records (memory mode for tests; Firestore `jobs` collection in production).
- **Idempotency:** `buildIdempotencyKey(jobType, payload)` — duplicate enqueue with same key returns the existing job and does not re-execute side effects marked complete.
- **Retries:** configurable maxAttempts; failures logged; exhausted jobs → `dead` status (dead-letter logging via `logger.error('job_dead_letter', …)`).
- **Handlers:** `reindex_materials`, `bulk_reorder_critical`, `nightly_digest`.

## Upgrade path
Interface mirrors Inngest-style `{ id, name, data }` events. When multi-instance Next.js is required, swap the runner for Inngest/Trigger.dev without changing handler signatures.

## Why not Inngest today
Keeps Phase 4 tests offline (no cloud webhook) and matches Phase 1–3 memory-store testing pattern.
