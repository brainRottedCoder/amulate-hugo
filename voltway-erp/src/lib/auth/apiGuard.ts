import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest, getClientIp } from '@/lib/auth/verifyRequest';
import {
  assertCanPerformAction,
  assertPermission,
  AuthError,
  PolicyError,
} from '@/lib/auth/rbac';
import { enforceHugoRateLimits } from '@/lib/auth/rateLimit';
import { createRequestId, logger } from '@/lib/observability/logger';
import { record429 } from '@/lib/observability/tracing';
import {
  assertWithinBudget,
  noteTrafficAndDetectAnomaly,
} from '@/lib/tenants/budgets';
import type { AuthUser, HugoPermission } from '@/types/auth';

export function jsonError(error: unknown, requestId?: string) {
  if (error instanceof AuthError || error instanceof PolicyError) {
    return NextResponse.json(
      { error: error.message, requestId },
      { status: error.status }
    );
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  return NextResponse.json({ error: message, requestId }, { status: 500 });
}

export async function requireHugoAuth(
  request: NextRequest,
  options?: {
    permission?: HugoPermission;
    action?: string;
    rateLimit?: boolean;
    /** Skip tenant budget (admin routes may still check). */
    skipBudget?: boolean;
  }
): Promise<{ user: AuthUser; requestId: string } | NextResponse> {
  const requestId =
    request.headers.get('x-request-id') || createRequestId();

  try {
    const user = await verifyRequest(request);

    if (options?.permission) {
      assertPermission(user, options.permission);
    }
    if (options?.action) {
      assertCanPerformAction(user, options.action);
    }

    noteTrafficAndDetectAnomaly(user.tenantId);

    if (!options?.skipBudget) {
      const budgetMode =
        process.env.BUDGET_STORE === 'memory' || process.env.VITEST
          ? 'memory'
          : 'firestore';
      await assertWithinBudget({
        tenantId: user.tenantId,
        role: user.role,
        mode: budgetMode,
      });
    }

    if (options?.rateLimit !== false) {
      const ip = getClientIp(request);
      const limit = enforceHugoRateLimits(user.uid, ip);
      if (!limit.allowed) {
        record429();
        logger.warn('rate_limited', {
          requestId,
          userId: user.uid,
          tenantId: user.tenantId,
          retryAfterSec: limit.retryAfterSec,
        });
        return NextResponse.json(
          {
            error: 'Rate limit exceeded. Try again shortly.',
            requestId,
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(limit.retryAfterSec),
              'X-Request-Id': requestId,
            },
          }
        );
      }
    }

    return { user, requestId };
  } catch (error) {
    logger.warn('auth_failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(error, requestId);
  }
}

export async function requireAdmin(
  request: NextRequest
): Promise<{ user: AuthUser; requestId: string } | NextResponse> {
  return requireHugoAuth(request, {
    permission: 'admin',
    rateLimit: false,
    skipBudget: true,
  });
}
