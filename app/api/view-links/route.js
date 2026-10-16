import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { logSecurityEvent } from '@/lib/security';
import { getViewLinkStatus, issueViewLink, revokeViewLink } from '@/lib/view-access';

export const dynamic = 'force-dynamic';

function noStore(body, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(req) {
  const me = await getCurrentUser();
  if (!me) return noStore({ error: 'Not signed in.' }, 401);
  try {
    const status = await getViewLinkStatus(me.id);
    return noStore(status);
  } catch (err) {
    console.error('view link status error', err);
    await logSecurityEvent({ req, userId: me.id, eventType: 'view_link_status', status: 'failed' });
    return noStore({ error: 'Could not load the view link.' }, 500);
  }
}

export async function POST(req) {
  const me = await getCurrentUser();
  if (!me) return noStore({ error: 'Not signed in.' }, 401);
  try {
    const issued = await issueViewLink(me.id);
    await logSecurityEvent({ req, userId: me.id, eventType: 'view_link_created', status: 'success' });
    return noStore(issued);
  } catch (err) {
    console.error('view link create error', err);
    await logSecurityEvent({ req, userId: me.id, eventType: 'view_link_created', status: 'failed' });
    return noStore({ error: 'Could not create a view link.' }, 500);
  }
}

export async function DELETE(req) {
  const me = await getCurrentUser();
  if (!me) return noStore({ error: 'Not signed in.' }, 401);
  try {
    const revoked = await revokeViewLink(me.id);
    await logSecurityEvent({
      req,
      userId: me.id,
      eventType: 'view_link_revoked',
      status: revoked ? 'success' : 'failed',
    });
    return noStore({ revoked });
  } catch (err) {
    console.error('view link revoke error', err);
    await logSecurityEvent({ req, userId: me.id, eventType: 'view_link_revoked', status: 'failed' });
    return noStore({ error: 'Could not revoke the view link.' }, 500);
  }
}
