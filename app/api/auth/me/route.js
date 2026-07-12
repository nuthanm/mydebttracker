import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  getCurrentUser,
  hashRecoveryKey,
  validateRecoveryKey,
  verifyPin,
} from '@/lib/auth';
import { logSecurityEvent } from '@/lib/security';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: user.id,
      mobile: user.mobile,
      name: user.name,
      mfaEnabled: !!user.mfaEnabled,
      mfaSkipUntil: user.mfaSkipUntil,
    },
  });
}

export async function PATCH(req) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { name, currentPin, newRecoveryKey } = await req.json();

    if (typeof name === 'string' && name.trim()) {
      await sql`UPDATE users SET name = ${name.trim()} WHERE id = ${me.id}`;
    }

    if (newRecoveryKey) {
      if (!validateRecoveryKey(newRecoveryKey)) {
        return NextResponse.json({ error: 'Recovery key must be at least 8 characters.' }, { status: 400 });
      }
      if (!currentPin) {
        return NextResponse.json({ error: 'Current PIN is required to rotate recovery key.' }, { status: 400 });
      }
      const rows = await sql`SELECT pin_hash FROM users WHERE id = ${me.id} LIMIT 1`;
      const ok = await verifyPin(currentPin, rows[0]?.pin_hash);
      if (!ok) return NextResponse.json({ error: 'Current PIN is incorrect.' }, { status: 401 });
      const hash = await hashRecoveryKey(newRecoveryKey.trim());
      await sql`UPDATE users SET recovery_key_hash = ${hash} WHERE id = ${me.id}`;
      await logSecurityEvent({ req, userId: me.id, eventType: 'recovery_key_change', status: 'success' });
    }

    const updated = await sql`
      SELECT id, mobile, name, mfa_enabled, mfa_skip_until
      FROM users WHERE id = ${me.id} LIMIT 1
    `;
    return NextResponse.json({
      user: {
        ...updated[0],
        mfaEnabled: !!updated[0]?.mfa_enabled,
        mfaSkipUntil: updated[0]?.mfa_skip_until || null,
      },
    });
  } catch (err) {
    console.error('me PATCH error', err);
    return NextResponse.json({ error: 'Could not update.' }, { status: 500 });
  }
}
