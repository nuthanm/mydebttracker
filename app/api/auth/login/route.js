import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyPin, createSession, normalizeMobile, validatePin } from '@/lib/auth';
import { createLoginChallenge, logSecurityEvent } from '@/lib/security';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(req) {
  try {
    const { mobile, pin } = await req.json();
    if (!mobile || !pin) {
      return NextResponse.json({ error: 'Mobile and PIN are required.' }, { status: 400 });
    }
    if (!validatePin(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 });
    }

    const normalized = normalizeMobile(mobile);
    const rows = await sql`
      SELECT id, mobile, name, pin_hash, failed_login_attempts, locked_until, mfa_enabled
      FROM users
      WHERE mobile = ${normalized}
      LIMIT 1
    `;
    if (rows.length === 0) {
      await logSecurityEvent({ req, eventType: 'login_pin', status: 'failed', meta: { reason: 'mobile_not_found' } });
      return NextResponse.json({ error: 'No account found for this mobile. Please sign up first.' }, { status: 404 });
    }

    const user = rows[0];
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await logSecurityEvent({ req, userId: user.id, eventType: 'login_pin', status: 'failed', meta: { reason: 'account_locked' } });
      return NextResponse.json({ error: 'Account temporarily locked. Try again later.' }, { status: 423 });
    }

    const ok = await verifyPin(pin, user.pin_hash);
    if (!ok) {
      const nextFailed = Number(user.failed_login_attempts || 0) + 1;
      if (nextFailed >= MAX_FAILED_ATTEMPTS) {
        await sql`
          UPDATE users
          SET failed_login_attempts = ${nextFailed},
              locked_until = now() + (${LOCK_MINUTES} * interval '1 minute')
          WHERE id = ${user.id}
        `;
      } else {
        await sql`
          UPDATE users
          SET failed_login_attempts = ${nextFailed}
          WHERE id = ${user.id}
        `;
      }
      await logSecurityEvent({ req, userId: user.id, eventType: 'login_pin', status: 'failed' });
      return NextResponse.json({ error: 'Wrong PIN. Try again.' }, { status: 401 });
    }

    await sql`
      UPDATE users
      SET failed_login_attempts = 0,
          locked_until = NULL,
          last_login_at = now()
      WHERE id = ${user.id}
    `;

    if (user.mfa_enabled) {
      const challengeToken = await createLoginChallenge(user.id);
      await logSecurityEvent({ req, userId: user.id, eventType: 'login_pin', status: 'mfa_pending' });
      return NextResponse.json({ mfaRequired: true, challengeToken });
    }

    await createSession(user.id);
    await logSecurityEvent({ req, userId: user.id, eventType: 'login_pin', status: 'success' });
    return NextResponse.json({ user: { id: user.id, mobile: user.mobile, name: user.name } });
  } catch (err) {
    console.error('login error', err);
    return NextResponse.json({ error: 'Could not log in.' }, { status: 500 });
  }
}
