import { NextResponse } from 'next/server';
import { getCurrentUser, destroySession } from '@/lib/auth';
import { sql } from '@/lib/db';

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
