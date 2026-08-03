/**
 * Lightweight tracing + metrics (Phase 5).
 * In-memory for tests; logs spans for staging. Optional Sentry via SENTRY_DSN.
 */

import { logger } from '@/lib/observability/logger';
import { redactPii } from '@/lib/observability/redact';

export type Span = {
  name: string;
  requestId?: string;
  tenantId?: string;
  startMs: number;
  endMs?: number;
  attrs: Record<string, unknown>;
  error?: string;
};

type Metrics = {
  llmLatencyMs: number[];
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  toolErrors: number;
  toolCalls: number;
  rateLimit429: number;
  hugoRequests: number;
};

const spans: Span[] = [];
const metrics: Metrics = {
  llmLatencyMs: [],
  tokensIn: 0,
  tokensOut: 0,
  estimatedCostUsd: 0,
  toolErrors: 0,
  toolCalls: 0,
  rateLimit429: 0,
  hugoRequests: 0,
};

export function resetMetrics(): void {
  spans.length = 0;
  metrics.llmLatencyMs = [];
  metrics.tokensIn = 0;
  metrics.tokensOut = 0;
  metrics.estimatedCostUsd = 0;
  metrics.toolErrors = 0;
  metrics.toolCalls = 0;
  metrics.rateLimit429 = 0;
  metrics.hugoRequests = 0;
}

export function startSpan(
  name: string,
  attrs: Record<string, unknown> = {}
): Span {
  const span: Span = {
    name,
    requestId: typeof attrs.requestId === 'string' ? attrs.requestId : undefined,
    tenantId: typeof attrs.tenantId === 'string' ? attrs.tenantId : undefined,
    startMs: Date.now(),
    attrs: redactPii(attrs) as Record<string, unknown>,
  };
  spans.push(span);
  return span;
}

export function endSpan(span: Span, extra: Record<string, unknown> = {}): void {
  span.endMs = Date.now();
  Object.assign(span.attrs, redactPii(extra) as Record<string, unknown>);
  const latencyMs = span.endMs - span.startMs;
  logger.info('trace_span', {
    name: span.name,
    requestId: span.requestId,
    tenantId: span.tenantId,
    latencyMs,
    ...span.attrs,
    error: span.error,
  });
}

export function recordLlmCall(input: {
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  /** Rough MiniMax cost estimate $/1M tokens — override via env */
  costPer1M?: number;
}): void {
  metrics.llmLatencyMs.push(input.latencyMs);
  metrics.tokensIn += input.tokensIn || 0;
  metrics.tokensOut += input.tokensOut || 0;
  const rate = input.costPer1M ?? Number(process.env.LLM_COST_PER_1M || 0.5);
  metrics.estimatedCostUsd +=
    ((input.tokensIn || 0) + (input.tokensOut || 0)) * (rate / 1_000_000);
}

export function recordToolResult(ok: boolean): void {
  metrics.toolCalls += 1;
  if (!ok) metrics.toolErrors += 1;
}

export function record429(): void {
  metrics.rateLimit429 += 1;
}

export function recordHugoRequest(): void {
  metrics.hugoRequests += 1;
}

export function getMetricsSnapshot() {
  const lat = [...metrics.llmLatencyMs].sort((a, b) => a - b);
  const p95 =
    lat.length === 0 ? 0 : lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))];
  return {
    llmLatencyP95Ms: p95,
    tokensIn: metrics.tokensIn,
    tokensOut: metrics.tokensOut,
    estimatedCostUsd: Number(metrics.estimatedCostUsd.toFixed(6)),
    toolErrorRate:
      metrics.toolCalls === 0 ? 0 : metrics.toolErrors / metrics.toolCalls,
    rateLimit429: metrics.rateLimit429,
    hugoRequests: metrics.hugoRequests,
    recentSpans: spans.slice(-20),
  };
}

/** Capture exception — Sentry when configured, else structured log. */
export async function captureException(
  error: unknown,
  context: Record<string, unknown> = {}
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error('exception', {
    ...(redactPii(context) as Record<string, unknown>),
    message,
    stack,
  });

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Minimal Sentry envelope via store API (no SDK dep required for Phase 5)
    await fetch(`https://sentry.io/api/0/envelope/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: JSON.stringify({ message, level: 'error', extra: context }),
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}
