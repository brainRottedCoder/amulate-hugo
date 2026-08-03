import { NextRequest, NextResponse } from 'next/server';
import { requireHugoAuth, jsonError } from '@/lib/auth/apiGuard';
import { assertSessionOwner, listMessages } from '@/lib/hugo/memory/session';
import { getSessionSummary } from '@/lib/hugo/memory/summary';
import { getActiveAgentRunForSession, getAgentRun } from '@/lib/hugo/memory/scratchpad';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authResult = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: false,
  });
  if (authResult instanceof NextResponse) return authResult;
  const { user, requestId } = authResult;

  try {
    const { id } = await ctx.params;
    const session = await assertSessionOwner(id, user.uid);
    const messages = await listMessages(id);
    const summary = await getSessionSummary(id);
    const runId = request.nextUrl.searchParams.get('runId');
    const agentRun = runId
      ? await getAgentRun(runId)
      : await getActiveAgentRunForSession(id, user.uid);

    return NextResponse.json({
      session,
      messages,
      summary,
      agentRun,
      requestId,
    });
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error
        ? Number((error as { status: number }).status)
        : 500;
    if (status === 403 || status === 404) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Error', requestId },
        { status }
      );
    }
    return jsonError(error, requestId);
  }
}
