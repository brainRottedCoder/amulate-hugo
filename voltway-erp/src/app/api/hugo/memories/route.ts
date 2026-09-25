import { NextRequest, NextResponse } from 'next/server';
import { requireHugoAuth, jsonError } from '@/lib/auth/apiGuard';
import {
  deleteLongTermMemory,
  listLongTermMemories,
} from '@/lib/hugo/memory/longTerm';
import { getServerStoreMode } from '@/lib/storeMode';

export async function GET(request: NextRequest) {
  const authResult = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: false,
  });
  if (authResult instanceof NextResponse) return authResult;
  const { user, requestId } = authResult;

  try {
    const memories = await listLongTermMemories(user.uid);
    return NextResponse.json({ memories, requestId });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: true,
  });
  if (authResult instanceof NextResponse) return authResult;
  const { user, requestId } = authResult;

  try {
    const body = await request.json();
    const memoryId = body.memoryId as string;
    if (!memoryId) {
      return NextResponse.json({ error: 'memoryId required', requestId }, { status: 400 });
    }
    await deleteLongTermMemory(memoryId, user.uid, getServerStoreMode(), user.role === 'admin');
    return NextResponse.json({ success: true, requestId });
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
