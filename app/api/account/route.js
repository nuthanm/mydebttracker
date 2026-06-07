import { NextResponse } from 'next/server';
import { getCurrentUser, destroySession, verifyPin, hashPin, validatePin } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function PATCH(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { currentPin, newPin, confirmPin } = await req.json();
    if (!currentPin || !newPin || !confirmPin) {
      return NextResponse.json({ error: 'Current PIN, new PIN and confirmation PIN are required.' }, { status: 400 });
    }
    if (!validatePin(currentPin) || !validatePin(newPin) || !validatePin(confirmPin)) {
      return NextResponse.json({ error: 'PIN must be exactly 6 digits.' }, { status: 400 });
    }
    if (currentPin === newPin) {
      return NextResponse.json({ error: 'New PIN must be different from current PIN.' }, { status: 400 });
    }
    if (newPin !== confirmPin) {
      return NextResponse.json({ error: 'PINs do not match. Try again.' }, { status: 400 });
    }

    const rows = await sql`SELECT pin_hash FROM users WHERE id = ${user.id} LIMIT 1`;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const ok = await verifyPin(currentPin, rows[0].pin_hash);
    if (!ok) {
      return NextResponse.json({ error: 'Current PIN is incorrect.' }, { status: 401 });
    }

    const pinHash = await hashPin(newPin);
    await sql`UPDATE users SET pin_hash = ${pinHash} WHERE id = ${user.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/account error', err);
    return NextResponse.json({ error: 'Could not change PIN.' }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Related sessions/debts/payments/rate changes are removed by ON DELETE CASCADE constraints.
    await sql`DELETE FROM users WHERE id = ${user.id}`;
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/account error', err);
    return NextResponse.json({ error: 'Could not delete account.' }, { status: 500 });
  }
}
