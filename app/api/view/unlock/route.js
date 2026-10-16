import { NextResponse } from 'next/server';
import { logSecurityEvent } from '@/lib/security';
import { unlockViewLink } from '@/lib/view-access';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const token = String(body.token || '');
  const password = String(body.password || '');
  if (!password) {
    const response = NextResponse.json({ error: 'Enter the view password.' }, { status: 400 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  try {
    const result = await unlockViewLink(token, password);
    if (!result.ok) {
      await logSecurityEvent({
        req,
        userId: result.userId || null,
        eventType: 'view_link_unlock',
        status: 'failed',
        meta: { reason: result.status === 429 ? 'locked' : 'rejected' },
      });
      const response = NextResponse.json({ error: result.error }, { status: result.status });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    await logSecurityEvent({
      req,
      userId: result.userId,
      eventType: 'view_link_unlock',
      status: 'success',
    });
    const response = NextResponse.json({ ok: true });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    console.error('view link unlock error', err);
    const response = NextResponse.json({ error: 'Could not open this view.' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
