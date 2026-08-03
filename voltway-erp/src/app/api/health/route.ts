import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/config';
import { getEffectiveFlags } from '@/lib/config/runtimeFlags';

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: APP_VERSION,
    flags: getEffectiveFlags(),
    timestamp: new Date().toISOString(),
  });
}
