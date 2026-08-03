# Firestore backup / DR (Phase 5)

## RPO / RTO targets
| Env | RPO | RTO | Mechanism |
|-----|-----|-----|-----------|
| Staging | ≤ 24h | ≤ 4h | Daily export + seed scripts |
| Production | ≤ 1h | ≤ 2h | Firebase scheduled exports → GCS |

## Enable automated backups (prod)
1. GCP Console → Firestore → Import/Export
2. Create a GCS bucket `voltway-erp-backups` (region-matched, encryption default CMEK or Google-managed)
3. Schedule daily export of all collections (or critical: `materials`, `stock_levels`, `users`, `chat_*`, `tenant_budgets`)
4. Retention: 30 daily + 12 monthly

## Restore drill checklist (perform once on staging)
- [ ] Pick export timestamp
- [ ] Create empty staging project / namespace
- [ ] Import export into staging Firestore
- [ ] Smoke: login, inventory list, Hugo health `/api/health`
- [ ] Record date/time/operator below

### Drill evidence
```
Date: ________
Operator: ________
Export used: ________
Result: PASS / FAIL
Notes:
```

## App-level backup
Settings → Backup & Restore remains a **dev convenience** only — not a substitute for GCS exports.
