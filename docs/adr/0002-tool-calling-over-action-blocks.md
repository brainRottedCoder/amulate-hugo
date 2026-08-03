# ADR 0002 — Native tool calling over action blocks (Phase 2)

## Status
Accepted

## Context
Hugo originally asked the model to emit ```action``` JSON blocks parsed by regex. That is brittle and injection-prone.

## Decision
- Default `flags.hugoToolCalling=true` (disable with `HUGO_TOOL_CALLING=false`)
- Zod-validated tools in `src/lib/hugo/tools/*`
- Mutating tools require HITL confirm via pending tool store + audit log
