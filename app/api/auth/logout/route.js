import { NextResponse } from 'next/server';
import { destroySession, getCurrentUser } from '@/lib/auth';
import { logSecurityEvent } from '@/lib/security';

export async function POST(req) {
  const me = await getCurrentUser();
  await destroySession();
  if (me?.id) {
    await logSecurityEvent({ req, userId: me.id, eventType: 'logout', status: 'success' });
  }
  return NextResponse.json({ ok: true });
}
