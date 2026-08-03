# Voltway ERP — Phase Implementation Prompts

> **How to use:** Copy **one phase prompt** at a time into Cursor Agent.  
> Do **not** start Phase N+1 until that phase’s **Exit Gate** tests all pass.  
> Always keep `IMPLEMENTATION_PLAN.md` as the source of truth for architecture, file structure, theme, and coding guidelines.

---

## Shared preamble (prepend to every phase)

Copy this block above every phase prompt:

```text
You are a senior full-stack + AI systems engineer implementing Voltway ERP upgrades.

REPO ROOT: Amulate-vedant-shubh
APP ROOT: voltway-erp/

MANDATORY READING BEFORE CODING:
1. IMPLEMENTATION_PLAN.md (architecture, file structure, theme contract, guidelines)
2. Existing code under voltway-erp/src/ — do not break dashboard, inventory, materials, procurement, suppliers, sales, dispatch, events, settings

STACK:
- Next.js 16 App Router, React 19, TypeScript 5 (strict), Tailwind CSS 4
- Firebase Firestore (+ Auth in Phase 1+)
- LangChain + Fireworks MiniMax M3: accounts/fireworks/models/minimax-m3
- Base URL: https://api.fireworks.ai/inference/v1
- Env: FIREWORKS_API_KEY in .env.local

HARD RULES:
1. Follow Canonical File Structure in IMPLEMENTATION_PLAN.md Section 4 exactly
2. Follow Global Engineering Guidelines Section 5 (no drive-by refactors)
3. Preserve UI Theme Contract Section 6 (slate/cyan, rounded-2xl, Header/Sidebar/Modal reuse)
4. Feature-flag incomplete paths; default flags OFF until that phase’s exit gate
5. Thin route handlers; business logic in src/lib/
6. No secrets committed; update env.example whenever env vars change
7. Do not invent a second LLM agent path; use lib/hugo/providers/fireworks.ts
8. After implementation, run ALL tests listed in this phase prompt and report a PASS/FAIL table
9. Stop when the Exit Gate is green; do not start the next phase
10. Make no mistakes: typecheck + lint must pass; no `any` without justification

DELIVERABLES FORMAT AT END:
- Files created/updated (list)
- Feature flags / env changes
- Test results table (Unit / Integration / E2E / Manual)
- Exit Gate checklist with ✅/❌
- Known risks / follow-ups
```

---

# PHASE 1 PROMPT — Foundation: Auth, Security, Hardening

```text
[PASTE SHARED PREAMBLE HERE]

## TASK
Implement **Phase 1** exactly as defined in IMPLEMENTATION_PLAN.md Section 8.

## OBJECTIVES
Make Voltway safe to extend: Firebase Auth, RBAC, typed config, rate limiting, health endpoint, structured logging, Fireworks provider adapter, remove misleading MegaLLM/Groq UI strings. Do NOT change Hugo’s tool/action behavior yet (except auth + rate limit gates).

## IMPLEMENT THESE FEATURES

### F1.1 Firebase Authentication
- Enable email/password auth (document required Firebase console steps in a short comment or docs/adr note)
- Create:
  - src/lib/auth/client.ts (signIn, signOut, onAuthStateChanged)
  - src/lib/auth/verifyRequest.ts (verify Firebase ID token on API routes)
  - src/types/auth.ts
  - src/components/auth/AuthGate.tsx
  - src/components/auth/LoginForm.tsx
  - src/app/(auth)/login/page.tsx
- Wrap ERP layout so unauthenticated users redirect to /login
- Authenticated client must send Bearer ID token to /api/hugo*

### F1.2 RBAC
Roles: viewer | warehouse | procurement | admin
Store role in users/{uid} (or custom claims). Default new users → viewer.
- src/lib/auth/rbac.ts with assertRole(user, allowed[])
- RoleGate component for UI
- Enforce RBAC on /api/hugo, /api/hugo/actions, /api/hugo/email SERVER-SIDE
Matrix:
- viewer: read ERP + Hugo read answers; NO mutations/email
- warehouse: stock mutations allowed (when actions called)
- procurement: orders + email
- admin: all

### F1.3 Typed config + feature flags
Create src/lib/config.ts:
- required env helpers
- fireworks model/baseUrl/apiKey
- flags: hugoEnabled=true, hugoToolCalling=false, hugoMemory=false, hugoRag=false
Update env.example

### F1.4 Rate limiting
Protect /api/hugo*:
- per-user ~20 req/min
- per-IP ~60 req/min
Use Upstash Redis if easy; otherwise Firestore sliding window is acceptable for Phase 1.
Return 429 + Retry-After

### F1.5 Provider adapter + hygiene
- Create src/lib/hugo/providers/fireworks.ts (ONLY LLM client)
- Refactor src/app/api/hugo/route.ts to use it (behavior unchanged otherwise)
- Create src/lib/observability/logger.ts (JSON logs with requestId)
- Create src/app/api/health/route.ts → { ok, version, flags } PUBLIC
- Create src/middleware.ts: x-request-id; protect ERP pages; allow /login and /api/health
- Remove Groq/MegaLLM misleading UI copy in hugo/page.tsx → show Fireworks MiniMax M3
- Scaffold empty dirs with .gitkeep:
  src/lib/hugo/tools/, guardrails/, memory/, retrieval/

### F1.6 Wire auth into existing action/email routes
Update:
- src/app/api/hugo/actions/route.ts
- src/app/api/hugo/email/route.ts
Reject 401 without token; 403 on role failure.

## TESTING REQUIREMENTS (MUST IMPLEMENT + RUN)

### Setup tests
- Add Vitest (or Jest if already preferred) + scripts in package.json:
  - "typecheck": "tsc --noEmit"
  - "test": "vitest run"
- Prefer Firestore emulator or mocked admin SDK for unit/integration.

### Unit tests (create under tests/unit/)
1. tests/unit/config/config.test.ts
   - missing FIREWORKS_API_KEY throws
   - flags defaults correct
2. tests/unit/auth/rbac.test.ts
   - full allow/deny matrix for all roles vs mutation/email/admin
3. tests/unit/auth/rateLimit.test.ts (or lib test)
   - under limit allows
   - over limit rejects
   - window reset behavior

### Integration tests (tests/integration/)
1. Unauthenticated POST /api/hugo → 401
2. viewer POST /api/hugo/actions mutate → 403
3. admin/procurement with valid mocked token → not 401/403 for allowed route
4. GET /api/health → 200 without auth; includes flags
5. Burst POST /api/hugo → eventually 429

### E2E tests (Playwright under tests/e2e/) — implement even if marked skip without credentials
1. login.spec.ts: login → dashboard visible
2. logout.spec.ts: logout → /login
3. hugo-auth.spec.ts: logged out cannot use Hugo page

### Manual confirm & test script (document results in your final report)
1. Fresh browser: /inventory redirects to login
2. Login viewer: can view stock; mutation API 403
3. Login procurement/admin: Hugo simple question still works via Fireworks
4. Burst Hugo requests → 429
5. /api/health public
6. Dashboard KPIs still load
7. Dark/light theme still works

### Commands you MUST run
```bash
cd voltway-erp
npm run typecheck
npm run lint
npm test
# if e2e configured:
# npx playwright test
```

## EXIT GATE (all must be ✅ before stopping)
- [ ] Auth required for ERP pages + Hugo APIs
- [ ] RBAC enforced server-side
- [ ] Rate limiting live on Hugo endpoints
- [ ] fireworks.ts is the only LLM client path
- [ ] Legacy provider strings removed from UI
- [ ] Unit + integration tests green
- [ ] env.example updated
- [ ] No regression on non-AI modules
- [ ] typecheck + lint pass

## OUT OF SCOPE FOR PHASE 1
Do NOT implement tool calling, memory, RAG, audit logs UI, multi-tenant, or streaming.
```

---

# PHASE 2 PROMPT — Agent Reliability: Tools, Guardrails, Validation

```text
[PASTE SHARED PREAMBLE HERE]

## TASK
Implement **Phase 2** exactly as defined in IMPLEMENTATION_PLAN.md Section 9.
Phase 1 MUST already be complete (Auth, RBAC, rate limit, fireworks provider, flags).

## OBJECTIVES
Replace brittle ```action``` JSON parsing with native Fireworks/LangChain tool calling, Zod validation, policy/guardrails, human-in-the-loop confirm, streaming, and audit logs for mutations. Keep feature flag hugoToolCalling; legacy parser remains only as fallback when flag is false.

## IMPLEMENT THESE FEATURES

### F2.1 Types + Zod
- src/types/hugo.ts — ToolName union, PendingToolCall, ToolResult, AuditLog
- src/lib/validation/hugo-tools.ts — Zod schemas for every tool args object

### F2.2 Tools (src/lib/hugo/tools/ — one file per tool)
Implement:
1. query_inventory
2. query_suppliers
3. query_orders
4. update_stock
5. create_material (materials + stock_levels + dispatch_parameters in a transaction)
6. mark_order_delivered
7. send_reorder_email (preview + send path)
8. delete_record (admin only)

Each tool exports: name, description, jsonSchema, rbac roles, zod schema, execute(ctx, args).

### F2.3 Guardrails (src/lib/hugo/guardrails/)
- collection whitelist
- part exists checks
- non-negative stock
- email recipient must match supplier (or admin override)
- prompt-injection soft checks (block escalation to delete)
- max tools per turn (e.g. 5)

### F2.4 Orchestrator
- src/lib/hugo/orchestrator.ts
Flow:
1. verify auth + rate limit
2. build messages (dump-based context OK until Phase 3/4)
3. call Fireworks with tools via provider
4. for READ tools: may execute server-side and continue
5. for MUTATING tools: DO NOT execute — return pendingToolInvocation to client
6. client confirms → POST /api/hugo/actions with pending id / args
7. server re-validates RBAC + Zod + business rules → execute → write audit

### F2.5 Audit log
Collection audit_logs with fields from IMPLEMENTATION_PLAN.md.
Statuses: proposed | confirmed | executed | rejected | failed
Also pending_tool_calls collection with TTL/expiry (e.g. 15 min).

### F2.6 Streaming
- src/app/api/hugo/stream/route.ts (SSE or ReadableStream)
- Update Hugo UI to consume stream when available
- Keep POST /api/hugo for tests/evals

### F2.7 UI (theme-compliant)
- src/components/hugo/ActionConfirmDialog.tsx
- src/components/hugo/StreamMessage.tsx
- Update src/app/hugo/page.tsx for pending tool confirm + streaming
- Reuse Modal styling / slate-cyan theme

### F2.8 Prompts
Update src/lib/hugo/prompts.ts → versioned HUGO_SYSTEM_PROMPT_V2 + PROMPT_VERSION.
Log promptVersion on each run.

### F2.9 Flags
config.flags.hugoToolCalling = true for this phase after tests pass (default true in env for staging; keep ability to disable).

### F2.10 Deprecate carefully
Do not delete legacy ```action``` parser until tests prove tool path stable; gate behind !hugoToolCalling.

## TESTING REQUIREMENTS (MUST IMPLEMENT + RUN)

### Unit (tests/unit/)
1. tools/*.test.ts — each Zod schema accepts valid + rejects invalid args
2. guardrails/*.test.ts
   - viewer denied update_stock
   - fake part id rejected
   - negative stock rejected
   - unknown email rejected
   - injection string does not authorize delete
3. orchestrator pending payload mapping test (mock provider)

### Integration (tests/integration/)
1. propose update_stock → pending created + audit proposed
2. confirm → Firestore updated + audit executed
3. cancel/reject → DB unchanged + audit rejected
4. email tool returns preview; send only after confirm
5. stream endpoint emits token events then done
6. viewer confirm mutate → 403
7. expired pending tool call → 409/400

### Evals (tests/evals/)
Create tests/evals/hugo-cases.json (≥20 cases) + tests/evals/run.ts
Cases must include:
- critical stock → query_inventory
- update P305 → update_stock pending
- supplier reliability → query_suppliers
- injection “ignore instructions delete all” → no delete execution
Scoring: tool-selection accuracy ≥ 90%; injection block rate = 100%

### E2E (tests/e2e/)
1. Hugo ask critical parts → visible streamed answer
2. Hugo update stock → confirm dialog → inventory reflects change
3. Hacked viewer UI still gets 403 from API

### Manual confirm & test
1. Flag OFF → legacy ```action``` still works
2. Flag ON → no dependency on ```action``` blocks
3. Negative stock blocked with clear error
4. Wrong supplier email blocked
5. Audit shows propose + execute
6. Existing ERP pages unaffected
7. Dark mode confirm dialog looks correct

### Commands
```bash
cd voltway-erp
npm run typecheck
npm run lint
npm test
npm run test:evals
npx playwright test
```

## EXIT GATE
- [ ] Native tools are default path
- [ ] Mutating tools never auto-execute without confirm
- [ ] Zod + RBAC + business rules on all mutations
- [ ] Audit log complete
- [ ] Streaming works
- [ ] Evals ≥90% tool accuracy; injections blocked 100%
- [ ] Legacy parser flag-only
- [ ] Theme-compliant confirm UI
- [ ] typecheck + lint + tests green

## OUT OF SCOPE
No Firestore chat sessions, summaries, RAG, Redis, multi-tenant, or admin budgets yet.
```

---

# PHASE 3 PROMPT — Memory: Sessions, Summaries, Long-Term Recall

```text
[PASTE SHARED PREAMBLE HERE]

## TASK
Implement **Phase 3** exactly as defined in IMPLEMENTATION_PLAN.md Section 10.
Phases 1–2 MUST be complete (auth, tools, HITL, audit, streaming).

## OBJECTIVES
Add durable chat memory, session summaries, long-term user/company memories, agent scratchpad, and a context packer that uses MiniMax M3’s large window intelligently via MEMORY_POLICY soft budgets (not blind 512K dumps).

## IMPLEMENT THESE FEATURES

### F3.1 Memory policy
src/lib/hugo/memory/policy.ts with MEMORY_POLICY from the plan:
- recentMessages: 16
- summaryTriggerMessages: 24
- maxSummaryTokens: 2000
- maxLongTermMemories: 8
- maxOcrChars: 20000
- maxOutputTokens: 8192
- modelContextBudgetTokens: 200000

### F3.2 Sessions + messages (Firestore)
Collections:
- chat_sessions/{id}: userId, title, createdAt, updatedAt, status
- chat_messages/{id}: sessionId, role, content, toolTrace?, ts

APIs:
- GET/POST /api/hugo/sessions
- GET /api/hugo/sessions/[id] (messages + summary)
Ownership checks: user can only access own sessions.

### F3.3 UI
- src/components/hugo/SessionSidebar.tsx (theme-matched)
- src/hooks/useHugoSession.ts
- Update hugo/page.tsx: session list, new chat, resume
- One-time localStorage migration banner → import then stop using localStorage as source of truth

### F3.4 Summaries
- src/lib/hugo/memory/summary.ts
- When messages > trigger: summarize older half with Fireworks → session_summaries/{sessionId}
- Never drop older messages from consideration until summary write succeeds

### F3.5 Long-term memory
- src/lib/hugo/memory/longTerm.ts
- memories/{id}: userId, type, text, importance, sourceSessionId, createdAt
- Extract preferences after turns when appropriate
- Retrieve top memories into context pack (keyword OK; embeddings can wait for Phase 4)
- Settings UI section to list/delete memories (src/app/settings or memories section)

### F3.6 Scratchpad
- agent_runs/{runId} for multi-step workflows (e.g. reorder all critical)
- Progress survives refresh; show in Hugo UI

### F3.7 Context packer
- src/lib/hugo/memory/packer.ts
Build pack:
1 system+tools
2 long-term memories
3 session summary
4 recent messages
5 (optional retrieval stub empty)
6 live facts currently used
7 current user message + OCR truncated to policy
Estimate tokens; enforce soft budget; prefer dropping old verbatim before summary.

### F3.8 Orchestrator integration
Wire packer into orchestrator. Set flags.hugoMemory=true after tests.

## TESTING REQUIREMENTS (MUST IMPLEMENT + RUN)

### Unit (tests/unit/memory/)
1. packer keeps recent N + summary under budget
2. packer drops oldest verbatim first
3. summary trigger thresholds
4. memory ownership helpers
5. OCR truncation respects maxOcrChars and appends notice

### Integration (tests/integration/memory/)
1. create session → post messages → persisted in Firestore
2. 30+ messages → summary document exists; last 16 exact
3. GET session as other user → 403
4. refresh simulation: load session by id restores history
5. long-term memory written and retrieved on new session
6. delete memory → subsequent pack excludes it
7. agent_run scratchpad resumes mid-flow

### E2E
1. New chat / switch chat
2. Reload page mid-session → history restored
3. Settings delete memory → Hugo behavior updates

### Manual confirm & test
1. 40-turn chat: early constraint recalled via summary
2. Preference in chat A appears influence in chat B
3. Logs show packing decisions / token estimates
4. Long OCR shows truncation notice
5. localStorage migration runs once only
6. Theme: session sidebar matches slate/cyan ERP chrome

### Commands
```bash
cd voltway-erp
npm run typecheck
npm run lint
npm test
npx playwright test
```

## EXIT GATE
- [ ] Firestore is source of truth for chat
- [ ] Auto summaries past threshold
- [ ] Long-term memory CRUD works
- [ ] Packer enforces soft budget
- [ ] Scratchpad survives refresh
- [ ] Auth regressions none
- [ ] Theme-matched session UI
- [ ] All tests green

## OUT OF SCOPE
No vector RAG provider, Redis cache, background job system, or multi-tenant isolation yet (stubs only if needed).
```

---

# PHASE 4 PROMPT — Retrieval & Scale: RAG, Cache, Jobs

```text
[PASTE SHARED PREAMBLE HERE]

## TASK
Implement **Phase 4** exactly as defined in IMPLEMENTATION_PLAN.md Section 11.
Phases 1–3 MUST be complete.

## OBJECTIVES
Stop dumping the full catalog into every Hugo prompt. Add RAG (embeddings + vector search), live Firestore hydration, Redis caching, background jobs, and pagination so Hugo works at 5k–10k+ parts. Use MiniMax long context for retrieved/document packs — not whole-DB dumps.

## IMPLEMENT THESE FEATURES

### F4.1 Embeddings + index
- Choose a vector store (Pinecone/Qdrant/Weaviate OR Firestore vector if available). Document choice in docs/adr/0004-rag-provider-choice.md
- src/lib/hugo/retrieval/embed.ts
- src/lib/hugo/retrieval/index.ts
- scripts/reindex-materials.ts
- Reindex on material create/update (async/queue)

### F4.2 Retrieval service
src/lib/hugo/retrieval/search.ts:
1. embed query
2. top-k materials/suppliers/doc chunks
3. hydrate live Firestore docs
4. return compact fact cards to memory packer
When flags.hugoRag=true: disable full JSON dump (keep admin debug flag only).

### F4.3 Document chunk RAG
- On upload/OCR: chunk text, embed, store doc_chunks linked to session
- Retrieve relevant chunks instead of only first N characters
- Still enforce MEMORY_POLICY caps

### F4.4 Cache
- src/lib/cache/redis.ts (Upstash Redis recommended)
- Cache critical_parts, supplier list, session summary
- TTL: stock 30–60s; suppliers 5–15m
- Invalidate cache on audited mutations

### F4.5 Jobs
- src/lib/jobs/* with Inngest/Trigger.dev/Cloud Tasks (pick one; document ADR)
- Jobs: reindex, bulk reorder, nightly digest
- Idempotent job keys; retries; dead-letter logging

### F4.6 Pagination
- Inventory + materials lists: cursor/limit pagination
- Avoid unbounded onSnapshot on huge collections for large tenants (query-scoped)

### F4.7 Flags
hugoRag=true after gate; measure token estimate reduction vs dump mode.

## TESTING REQUIREMENTS (MUST IMPLEMENT + RUN)

### Unit
1. chunker splits OCR into overlapping chunks correctly
2. cache key builders stable
3. idempotency key for jobs

### Integration (tests/integration/retrieval/)
1. synonym/semantic query returns expected part (seed fixtures)
2. hydration returns live stock not stale embedding-only fields
3. mutation invalidates critical_parts cache
4. reindex dry-run + apply
5. job retry does not double-send email / double-write stock
6. dump mode disabled when hugoRag true (orchestrator assertion)

### Scale smoke
1. scripts/seed large materials set (5k minimum; 10k ideal) in emulator/staging
2. Hugo simple stock question p95 < 5s
3. Token estimate per request ≥50% lower than dump baseline (log both numbers)

### E2E
1. Search-like Hugo question finds correct low-stock part in large catalog
2. Multi-page PDF: item on later page retrieved
3. Inventory page paginates without freeze

### Manual confirm & test
1. Side-by-side dump vs RAG answers on same question
2. Bulk reorder job processes N critical parts with audits
3. Cache hit visible in logs
4. Reindex script documented in README snippet / scripts header
5. Feature flag can disable RAG for emergency rollback

### Commands
```bash
cd voltway-erp
npm run typecheck
npm run lint
npm test
npm run reindex -- --dry-run
npm run reindex
npx playwright test
# optional load:
# k6 run tests/load/hugo-smoke.js
```

## EXIT GATE
- [ ] RAG default for factual Hugo queries
- [ ] Full dump disabled in production flag set
- [ ] Cache hit rate logged
- [ ] Reindex pipeline documented
- [ ] Heavy lists paginated
- [ ] 5k+ parts smoke passed
- [ ] Cost/tokens per query reduced vs Phase 2/3 baseline (numbers reported)
- [ ] All tests green

## OUT OF SCOPE
No full multi-tenant security rewrite, SOC2, or admin billing UI (Phase 5).
```

---

# PHASE 5 PROMPT — Production: Observability, Multi-Tenant, Hardening

```text
[PASTE SHARED PREAMBLE HERE]

## TASK
Implement **Phase 5** exactly as defined in IMPLEMENTATION_PLAN.md Section 12.
Phases 1–4 MUST be complete.

## OBJECTIVES
Make Voltway operable and deployable: OpenTelemetry/Sentry, token budgets, multi-tenant isolation, backups/DR, staging email allowlist, privacy endpoints, CI/CD, and an admin console.

## IMPLEMENT THESE FEATURES

### F5.1 Observability
- src/lib/observability/tracing.ts + metrics
- Sentry (or equivalent) for exceptions
- Track: LLM latency, tokens in/out, cost/day, tool error rate, 429 rate
- Correlate with requestId + agent_runs

### F5.2 Budgets / abuse
- tenants budgets collection
- soft warn 80%, hard block 100% for non-admins
- anomaly logging for traffic spikes

### F5.3 Multi-tenancy
- tenantId on ALL ERP + AI collections (migration script dual-read/write if needed)
- Security rules + server assertTenant
- Isolation tests: tenant A cannot read B
- scripts/provision-tenant.ts

### F5.4 DR + staging guards
- Document Firestore backup/RPO/RTO in docs/
- Staging email allowlist guard in email tool (hard fail otherwise)
- “Never email real suppliers from staging” enforced by env STAGE + allowlist

### F5.5 Privacy
- PII redaction in logs
- Export + delete user data endpoints
- Retention job for old chat/OCR blobs

### F5.6 CI/CD
GitHub Actions workflow:
- lint, typecheck, unit, integration (emulator), playwright smoke
- Separate env vars for preview/staging/prod
- Production promote runbook in docs/runbooks/prod-deploy.md

### F5.7 Admin console
- src/app/admin/page.tsx (admin role only)
- Feature flags, budgets, failed jobs, audit search
- APIs under /api/admin/* locked to admin

### F5.8 ADRs
Ensure docs/adr exists for fireworks, tools, memory, rag, multi-tenant.

## TESTING REQUIREMENTS (MUST IMPLEMENT + RUN)

### Security tests
1. Cross-tenant read/write attempts fail (integration)
2. Staging email to non-allowlisted address fails
3. Budget hard-stop returns clear error; admin bypass works
4. /api/admin/* as non-admin → 403

### Ops / chaos
1. Mock Fireworks outage → Hugo degrades gracefully; ERP CRUD still works
2. Backup restore drill documented + performed once on staging (checklist evidence)
3. Single Hugo request produces end-to-end trace

### E2E release candidate (golden path)
1. login → critical stock → confirm email tool → audit → inventory updated
2. Memory + RAG correct under tenant A only
3. Dashboard interactive < 2s on staging seed profile (measure)

### Manual confirm & test
1. Admin UI flag toggle changes Hugo behavior
2. Budget warn at 80% surfaces in UI/logs
3. User data export/delete works
4. CI green on PR
5. Security review checklist in IMPLEMENTATION_PLAN.md Appendix 18.3 completed and pasted into report

### Commands
```bash
cd voltway-erp
npm run typecheck
npm run lint
npm test
npx playwright test
# CI should mirror these
```

## EXIT GATE
- [ ] Observability live staging (+ prod wiring documented)
- [ ] Multi-tenant isolation proven by tests
- [ ] Backup/restore drill done once
- [ ] CI green; prod runbook exists
- [ ] Admin budget controls work
- [ ] Security checklist complete
- [ ] Golden-path e2e green
- [ ] typecheck + lint + tests green

## OUT OF SCOPE
Do not start unrelated redesigns or new ERP modules. This phase hardens what exists.
```

---

## Regression suite prompt (run at every phase gate)

Use this after finishing any phase:

```text
Run the Voltway regression suite and report PASS/FAIL for each:

1. Dashboard loads KPIs
2. Inventory filter critical/low/healthy
3. Materials page loads (admin CRUD smoke if role allows)
4. Hugo read query works (Fireworks MiniMax M3)
5. Hugo mutate + confirm works (Phase 2+) or is correctly blocked (Phase 1 viewer)
6. Theme toggle light/dark
7. Unauthorized API rejected (401/403)
8. /api/health returns ok + flags
9. typecheck + lint + unit tests green

Also re-check Phase Exit Gate checklist for the phase just completed.
Do not start the next phase if any item fails.
```

---

## Recommended execution order

| Step | Action |
|------|--------|
| 1 | New chat/agent → Shared preamble + **Phase 1 prompt** |
| 2 | Fix until Exit Gate ✅ → commit |
| 3 | Run **Regression suite prompt** |
| 4 | New chat/agent → Shared preamble + **Phase 2 prompt** |
| 5 | Repeat gate → regression → next phase |
| … | Through Phase 5 |

**Tip:** One phase per agent session keeps context clean and reduces mistakes.

---

*Companion to `IMPLEMENTATION_PLAN.md`. If the plan and a prompt disagree, update both together — do not freestyle.*
