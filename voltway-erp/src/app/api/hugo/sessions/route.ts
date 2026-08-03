import { NextRequest, NextResponse } from 'next/server';
import { requireHugoAuth, jsonError } from '@/lib/auth/apiGuard';
import { createSession, listSessions } from '@/lib/hugo/memory/session';
import { flags } from '@/lib/config';

export async function GET(request: NextRequest) {
  const authResult = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: false,
  });
  if (authResult instanceof NextResponse) return authResult;
  const { user, requestId } = authResult;

  try {
    const sessions = await listSessions(user.uid);
    return NextResponse.json({
      sessions,
      hugoMemory: flags.hugoMemory,
      requestId,
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: true,
  });
  if (authResult instanceof NextResponse) return authResult;
  const { user, requestId } = authResult;

  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title : 'New chat';
    const session = await createSession(user.uid, title);
    return NextResponse.json({ session, requestId }, { status: 201 });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
