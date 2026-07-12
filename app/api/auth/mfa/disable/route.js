import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser, verifyPin, verifyTotpToken } from '@/lib/auth';
import { logSecurityEvent } from '@/lib/security';

export async function POST(req) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { currentPin, code } = await req.json();
    if (!currentPin || !code) {
      return NextResponse.json({ error: 'Current PIN and MFA code are required.' }, { status: 400 });
    }

    const rows = await sql`
      SELECT pin_hash, mfa_secret, mfa_enabled
      FROM users
      WHERE id = ${me.id}
      LIMIT 1
    `;
    const user = rows[0];
    if (!user?.mfa_enabled || !user?.mfa_secret) {
      return NextResponse.json({ error: 'MFA is not enabled.' }, { status: 400 });
    }

    const pinOk = await verifyPin(currentPin, user.pin_hash);
    if (!pinOk) {
      await logSecurityEvent({ req, userId: me.id, eventType: 'mfa_disable', status: 'failed', meta: { reason: 'bad_pin' } });
      return NextResponse.json({ error: 'Current PIN is incorrect.' }, { status: 401 });
    }

    const codeOk = verifyTotpToken(code, user.mfa_secret);
    if (!codeOk) {
      await logSecurityEvent({ req, userId: me.id, eventType: 'mfa_disable', status: 'failed', meta: { reason: 'bad_code' } });
      return NextResponse.json({ error: 'Invalid MFA code.' }, { status: 401 });
    }

    await sql`
      UPDATE users
      SET mfa_enabled = FALSE,
          mfa_secret = NULL,
          mfa_pending_secret = NULL
      WHERE id = ${me.id}
    `;

    await logSecurityEvent({ req, userId: me.id, eventType: 'mfa_disable', status: 'success' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('mfa disable error', err);
    return NextResponse.json({ error: 'Could not disable MFA.' }, { status: 500 });
  }
}
