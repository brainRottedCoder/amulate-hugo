# Production deploy runbook

## Preconditions
- [ ] Phase 1–5 exit gates signed
- [ ] CI green on `main`
- [ ] Secrets set in host (Vercel/GCP): `FIREWORKS_API_KEY`, Firebase public keys, SMTP, optional `SENTRY_DSN`, `UPSTASH_*`, `STAGING_EMAIL_ALLOWLIST` (staging only)
- [ ] `VOLTWAY_ENV=production` on prod; never set staging allowlist bypass on prod

## Promote steps
1. Tag release: `git tag v0.5.0-phase5 && git push --tags`
2. Deploy preview → run Playwright golden path with staging creds
3. Promote preview → production
4. Smoke: `/api/health`, login, Hugo one read query, inventory page
5. Watch logs for `trace_span`, `budget_soft_warn`, `cache_hit`

## Rollback
1. Redeploy previous Vercel deployment
2. Feature flags emergency: Admin console or env `HUGO_RAG=false` / `HUGO_TOOL_CALLING=false`
3. If bad data write: restore Firestore export per `docs/dr-firestore-backups.md`

## Post-deploy
- Confirm Sentry (if configured) receives a test exception from a canary
- Confirm tenant budgets visible in `/admin`
