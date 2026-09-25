import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, jsonError } from '@/lib/auth/apiGuard';
import { getMetricsSnapshot } from '@/lib/observability/tracing';
import {
  getEffectiveFlags,
  getFlagOverrides,
  setFlagOverrides,
} from '@/lib/config/runtimeFlags';
import {
  getOrCreateBudget,
  setTenantBudgetLimit,
  budgetStatus,
} from '@/lib/tenants/budgets';
import { getMemoryJobs } from '@/lib/jobs/runner';
import { getMemoryAudits } from '@/lib/hugo/audit';
import type { FeatureFlags } from '@/lib/config';
import { getServerStoreMode } from '@/lib/storeMode';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { user, requestId } = auth;

  try {
    const mode = getServerStoreMode();
    const budget = await getOrCreateBudget(user.tenantId, mode);
    const status = budgetStatus(budget);

    return NextResponse.json({
      requestId,
      flags: getEffectiveFlags(),
      flagOverrides: getFlagOverrides(),
      metrics: getMetricsSnapshot(),
      budget: { ...budget, ...status },
      failedJobs: getMemoryJobs().filter(
        (j) => j.status === 'failed' || j.status === 'dead'
      ),
      recentAudits: getMemoryAudits().slice(-50),
    });
  } catch (e) {
    return jsonError(e, requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { user, requestId } = auth;

  try {
    const body = await request.json();
    if (body.flags && typeof body.flags === 'object') {
      setFlagOverrides(body.flags as Partial<FeatureFlags>);
    }
    if (typeof body.monthlyTokenLimit === 'number') {
      const mode = getServerStoreMode();
      const tenantId =
        typeof body.tenantId === 'string' ? body.tenantId : user.tenantId;
      await setTenantBudgetLimit(tenantId, body.monthlyTokenLimit, mode);
    }
    return NextResponse.json({
      ok: true,
      flags: getEffectiveFlags(),
      requestId,
    });
  } catch (e) {
    return jsonError(e, requestId);
  }
}
