/**
 * Per-tenant token budgets (Phase 5).
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getServerStoreMode } from '@/lib/storeMode';
import { PolicyError } from '@/lib/auth/rbac';
import { logger } from '@/lib/observability/logger';

export type TenantBudget = {
  tenantId: string;
  monthlyTokenLimit: number;
  tokensUsed: number;
  period: string; // YYYY-MM
  updatedAt: string;
};

type Mode = 'firestore' | 'memory';

const memBudgets = new Map<string, TenantBudget>();
const requestCounts = new Map<string, { windowStart: number; count: number }>();

export function resetBudgets(): void {
  memBudgets.clear();
  requestCounts.clear();
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getOrCreateBudget(
  tenantId: string,
  mode: Mode = getServerStoreMode(),
  defaultLimit = Number(process.env.TENANT_MONTHLY_TOKEN_LIMIT || 2_000_000)
): Promise<TenantBudget> {
  const period = currentPeriod();
  if (mode === 'memory') {
    const existing = memBudgets.get(tenantId);
    if (existing && existing.period === period) return existing;
    const created: TenantBudget = {
      tenantId,
      monthlyTokenLimit: defaultLimit,
      tokensUsed: 0,
      period,
      updatedAt: new Date().toISOString(),
    };
    memBudgets.set(tenantId, created);
    return created;
  }

  const ref = doc(db, 'tenant_budgets', tenantId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as TenantBudget;
    if (data.period === period) return { ...data, tenantId };
  }
  const created: TenantBudget = {
    tenantId,
    monthlyTokenLimit: defaultLimit,
    tokensUsed: 0,
    period,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ref, created);
  return created;
}

export function budgetStatus(b: TenantBudget): {
  ratio: number;
  warn: boolean;
  blocked: boolean;
} {
  const ratio = b.monthlyTokenLimit <= 0 ? 0 : b.tokensUsed / b.monthlyTokenLimit;
  return {
    ratio,
    warn: ratio >= 0.8,
    blocked: ratio >= 1,
  };
}

export async function assertWithinBudget(input: {
  tenantId: string;
  role: string;
  mode?: Mode;
}): Promise<TenantBudget> {
  const mode = input.mode || getServerStoreMode();
  const b = await getOrCreateBudget(input.tenantId, mode);
  const status = budgetStatus(b);
  if (status.warn && !status.blocked) {
    logger.warn('budget_soft_warn', {
      tenantId: input.tenantId,
      ratio: status.ratio,
      tokensUsed: b.tokensUsed,
      limit: b.monthlyTokenLimit,
    });
  }
  if (status.blocked && input.role !== 'admin') {
    throw new PolicyError(
      `Tenant token budget exhausted (${b.tokensUsed}/${b.monthlyTokenLimit} for ${b.period}). Contact admin.`
    );
  }
  return b;
}

export async function recordTokenUsage(input: {
  tenantId: string;
  tokens: number;
  mode?: Mode;
}): Promise<TenantBudget> {
  const mode = input.mode || getServerStoreMode();
  const b = await getOrCreateBudget(input.tenantId, mode);
  const updated: TenantBudget = {
    ...b,
    tokensUsed: b.tokensUsed + Math.max(0, input.tokens),
    updatedAt: new Date().toISOString(),
  };
  if (mode === 'memory') {
    memBudgets.set(input.tenantId, updated);
  } else {
    await setDoc(doc(db, 'tenant_budgets', input.tenantId), updated);
  }
  return updated;
}

export async function setTenantBudgetLimit(
  tenantId: string,
  monthlyTokenLimit: number,
  mode: Mode = getServerStoreMode()
): Promise<TenantBudget> {
  const b = await getOrCreateBudget(tenantId, mode);
  const updated = {
    ...b,
    monthlyTokenLimit,
    updatedAt: new Date().toISOString(),
  };
  if (mode === 'memory') memBudgets.set(tenantId, updated);
  else await setDoc(doc(db, 'tenant_budgets', tenantId), updated);
  return updated;
}

/** Anomaly: >10× baseline request rate in a 60s window. */
export function noteTrafficAndDetectAnomaly(
  tenantId: string,
  baselinePerMin = 5
): boolean {
  const now = Date.now();
  const cur = requestCounts.get(tenantId) || { windowStart: now, count: 0 };
  if (now - cur.windowStart > 60_000) {
    cur.windowStart = now;
    cur.count = 0;
  }
  cur.count += 1;
  requestCounts.set(tenantId, cur);
  const spike = cur.count > baselinePerMin * 10;
  if (spike) {
    logger.warn('traffic_anomaly', {
      tenantId,
      count: cur.count,
      baselinePerMin,
    });
  }
  return spike;
}
