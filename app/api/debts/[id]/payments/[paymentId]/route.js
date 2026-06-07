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

  // Reverse principal reduction if applicable
  if (p.payment_type === 'principal') {
    const newPrincipal = Math.min(Number(debt[0].principal), Number(debt[0].current_principal) + Number(p.amount));
    await sql`UPDATE debts SET current_principal = ${newPrincipal} WHERE id = ${params.id}`;
  } else if (p.payment_type === 'clearance') {
    // Reactivate debt and restore principal
    const newPrincipal = Math.min(Number(debt[0].principal), Number(debt[0].current_principal) + Number(p.amount));
    await sql`UPDATE debts SET current_principal = ${newPrincipal}, status = 'active' WHERE id = ${params.id}`;
  }

  return NextResponse.json({ ok: true });
}
