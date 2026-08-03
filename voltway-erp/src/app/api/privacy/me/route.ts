import { NextRequest, NextResponse } from 'next/server';
import { requireHugoAuth, jsonError } from '@/lib/auth/apiGuard';
import { exportUserData, deleteUserData } from '@/lib/privacy/userData';

export async function GET(request: NextRequest) {
  const auth = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: false,
    skipBudget: true,
  });
  if (auth instanceof NextResponse) return auth;
  const { user, requestId } = auth;

  try {
    const mode = process.env.VITEST ? 'memory' : 'firestore';
    const data = await exportUserData(user.uid, mode);
    return NextResponse.json({ ...data, requestId });
  } catch (e) {
    return jsonError(e, requestId);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireHugoAuth(request, {
    permission: 'hugo:chat',
    rateLimit: true,
    skipBudget: true,
  });
  if (auth instanceof NextResponse) return auth;
  const { user, requestId } = auth;

  try {
    const mode = process.env.VITEST ? 'memory' : 'firestore';
    const result = await deleteUserData(user.uid, mode);
    return NextResponse.json({ ok: true, ...result, requestId });
  } catch (e) {
    return jsonError(e, requestId);
  }
}
