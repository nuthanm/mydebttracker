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

  // Recalculate current_principal from all remaining principal payments
  // to ensure correctness regardless of deletion order.
  if (p.payment_type === 'principal' || p.payment_type === 'clearance') {
    const remaining = await sql`
      SELECT COALESCE(SUM(amount), 0) AS total_repaid
      FROM debt_payments
      WHERE debt_id = ${params.id}
        AND payment_type IN ('principal', 'clearance')
    `;
    const totalRepaid = Number(remaining[0].total_repaid);
    const newPrincipal = Math.max(0, Number(debt[0].principal) - totalRepaid);

    // Only keep debt cleared if a clearance payment still exists
    const clearanceLeft = await sql`
      SELECT COUNT(*) AS cnt FROM debt_payments
      WHERE debt_id = ${params.id} AND payment_type = 'clearance'
    `;
    const newStatus = Number(clearanceLeft[0].cnt) > 0 ? 'cleared' : 'active';

    await sql`
      UPDATE debts
      SET current_principal = ${newPrincipal}, status = ${newStatus}
      WHERE id = ${params.id}
    `;
  }

  return NextResponse.json({ ok: true });
}
