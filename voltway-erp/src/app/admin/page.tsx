'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/layout/Header';
import { useAuth } from '@/components/auth/AuthProvider';
import { authFetch } from '@/lib/auth/authFetch';
import { useRouter } from 'next/navigation';

type AdminPayload = {
  flags: Record<string, boolean>;
  metrics: {
    llmLatencyP95Ms: number;
    tokensIn: number;
    tokensOut: number;
    estimatedCostUsd: number;
    toolErrorRate: number;
    rateLimit429: number;
    hugoRequests: number;
  };
  budget: {
    tenantId: string;
    monthlyTokenLimit: number;
    tokensUsed: number;
    period: string;
    warn: boolean;
    blocked: boolean;
    ratio: number;
  };
  failedJobs: Array<{ id: string; type: string; status: string; error?: string }>;
  recentAudits: Array<{ tool?: string; status?: string; userId?: string; ts?: string }>;
};

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AdminPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const res = await authFetch('/api/admin');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Admin API failed');
    setData(body);
    setLimitInput(String(body.budget?.monthlyTokenLimit ?? ''));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      setError('Admin role required');
      return;
    }
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'Error'));
  }, [user, loading, router, refresh]);

  const toggleFlag = async (key: string, value: boolean) => {
    setSaving(true);
    try {
      const res = await authFetch('/api/admin', {
        method: 'PATCH',
        body: JSON.stringify({ flags: { [key]: value } }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Update failed');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const saveBudget = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/api/admin', {
        method: 'PATCH',
        body: JSON.stringify({ monthlyTokenLimit: Number(limitInput) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Budget update failed');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Budget update failed');
    } finally {
      setSaving(false);
    }
  };

  if (error && !data) {
    return (
      <>
        <Header title="Admin" />
        <div className="p-8 text-red-600">{error}</div>
      </>
    );
  }

  return (
    <>
      <Header title="Admin Console" />
      <div className="p-8 max-w-[1100px] mx-auto space-y-6">
        {error && <p className="text-sm text-amber-600">{error}</p>}

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 mb-3">
            Feature flags
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {data &&
              Object.entries(data.flags).map(([key, value]) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs">{key}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    disabled={saving}
                    onChange={(e) => void toggleFlag(key, e.target.checked)}
                  />
                </label>
              ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 mb-3">
            Tenant budget
          </h2>
          {data && (
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>
                Period {data.budget.period}: {data.budget.tokensUsed} /{' '}
                {data.budget.monthlyTokenLimit} tokens (
                {Math.round(data.budget.ratio * 100)}%)
                {data.budget.warn && !data.budget.blocked && (
                  <span className="ml-2 text-amber-600">soft warn ≥80%</span>
                )}
                {data.budget.blocked && (
                  <span className="ml-2 text-red-600">hard block</span>
                )}
              </p>
              <div className="flex gap-2 items-center">
                <input
                  className="border rounded px-2 py-1 text-sm bg-transparent"
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveBudget()}
                  className="px-3 py-1.5 text-xs rounded bg-cyan-600 text-white"
                >
                  Save limit
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 mb-3">
            Metrics
          </h2>
          {data && (
            <ul className="grid sm:grid-cols-3 gap-3 text-sm">
              <li>LLM p95: {data.metrics.llmLatencyP95Ms}ms</li>
              <li>Tokens in/out: {data.metrics.tokensIn}/{data.metrics.tokensOut}</li>
              <li>Est. cost: ${data.metrics.estimatedCostUsd}</li>
              <li>Tool error rate: {(data.metrics.toolErrorRate * 100).toFixed(1)}%</li>
              <li>429s: {data.metrics.rateLimit429}</li>
              <li>Hugo requests: {data.metrics.hugoRequests}</li>
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 mb-3">
            Failed jobs
          </h2>
          {!data?.failedJobs?.length && (
            <p className="text-sm text-slate-500">No failed/dead jobs in memory store</p>
          )}
          <ul className="space-y-2 text-xs font-mono">
            {data?.failedJobs?.map((j) => (
              <li key={j.id}>
                {j.id} {j.type} {j.status} {j.error}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 mb-3">
            Recent audits
          </h2>
          <ul className="space-y-1 text-xs max-h-48 overflow-y-auto">
            {(data?.recentAudits || []).slice().reverse().map((a, i) => (
              <li key={i} className="font-mono text-slate-600 dark:text-slate-400">
                {a.ts} {a.tool} {a.status} {a.userId}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
