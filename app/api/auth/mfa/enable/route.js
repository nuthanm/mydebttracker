import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getCurrentUser, verifyTotpToken } from '@/lib/auth';
import { logSecurityEvent } from '@/lib/security';

export async function POST(req) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: 'Verification code is required.' }, { status: 400 });

    const rows = await sql`SELECT mfa_pending_secret FROM users WHERE id = ${me.id} LIMIT 1`;
    const secret = rows[0]?.mfa_pending_secret;
    if (!secret) return NextResponse.json({ error: 'Start MFA setup first.' }, { status: 400 });

    const ok = verifyTotpToken(code, secret);
    if (!ok) {
      await logSecurityEvent({ req, userId: me.id, eventType: 'mfa_enable', status: 'failed' });
      return NextResponse.json({ error: 'Invalid verification code.' }, { status: 401 });
    }

    await sql`
      UPDATE users
      SET mfa_secret = mfa_pending_secret,
          mfa_pending_secret = NULL,
          mfa_enabled = TRUE,
          mfa_skip_until = NULL
      WHERE id = ${me.id}
    `;

    await logSecurityEvent({ req, userId: me.id, eventType: 'mfa_enable', status: 'success' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('mfa enable error', err);
    return NextResponse.json({ error: 'Could not enable MFA.' }, { status: 500 });
  }
}
