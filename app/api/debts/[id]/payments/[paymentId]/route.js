import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function DELETE(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify debt ownership
  const debt = await sql`SELECT * FROM debts WHERE id = ${params.id} AND user_id = ${user.id} LIMIT 1`;
  if (!debt.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const payment = await sql`SELECT * FROM debt_payments WHERE id = ${params.paymentId} AND debt_id = ${params.id} LIMIT 1`;
  if (!payment.length) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });

  const p = payment[0];
  await sql`DELETE FROM debt_payments WHERE id = ${params.paymentId}`;

  // Recalculate balances from remaining principal-affecting records.
  if (['principal', 'clearance', 'topup'].includes(p.payment_type)) {
    const remainingTransactions = await sql`
      SELECT payment_date, payment_type, amount, created_at
      FROM debt_payments
      WHERE debt_id = ${params.id}
        AND payment_type IN ('principal', 'clearance', 'topup')
      ORDER BY payment_date ASC, created_at ASC
    `;

    const remainingTopup = remainingTransactions
      .filter((entry) => entry.payment_type === 'topup')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const totalTopupEver = remainingTopup + (p.payment_type === 'topup' ? Number(p.amount || 0) : 0);
    // Stored principal already includes every top-up ever recorded, including the
    // entry being deleted, so subtract all top-ups to recover the original base.
    const initialPrincipal = Math.max(0, Number(debt[0].principal || 0) - totalTopupEver);

    let currentPrincipal = initialPrincipal;
    let nextStatus = debt[0].status === 'cleared' ? 'cleared' : 'active';

    for (const entry of remainingTransactions) {
      const amount = Number(entry.amount || 0);
      if (entry.payment_type === 'topup') {
        currentPrincipal += amount;
        nextStatus = 'active';
      } else if (entry.payment_type === 'clearance') {
        currentPrincipal = 0;
        nextStatus = 'cleared';
      } else {
        currentPrincipal = Math.max(0, currentPrincipal - amount);
      }
    }

    const finalStatus = currentPrincipal === 0 ? nextStatus : 'active';

    await sql`
      UPDATE debts
      SET
        principal = ${initialPrincipal + remainingTopup},
        current_principal = ${currentPrincipal},
        status = ${finalStatus}
      WHERE id = ${params.id}
    `;
  }

  return NextResponse.json({ ok: true });
}
