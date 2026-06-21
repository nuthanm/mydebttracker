import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify ownership
  const debt = await sql`SELECT id FROM debts WHERE id = ${params.id} AND user_id = ${user.id} LIMIT 1`;
  if (!debt.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const payments = await sql`
    SELECT * FROM debt_payments
    WHERE debt_id = ${params.id}
    ORDER BY payment_date DESC, created_at DESC
  `;
  return NextResponse.json({ payments });
}

export async function POST(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const existing = await sql`SELECT * FROM debts WHERE id = ${params.id} AND user_id = ${user.id} LIMIT 1`;
    if (!existing.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const debt = existing[0];

    const body = await req.json();
    const { payment_date, payment_type, amount, notes } = body;

    if (!payment_date || !payment_type || !amount) {
      return NextResponse.json({ error: 'payment_date, payment_type and amount are required.' }, { status: 400 });
    }
    const validTypes = ['interest', 'principal', 'clearance', 'topup'];
    if (!validTypes.includes(payment_type)) {
      return NextResponse.json({ error: `payment_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number.' }, { status: 400 });
    }

    // Insert payment
    const rows = await sql`
      INSERT INTO debt_payments (debt_id, payment_date, payment_type, amount, notes)
      VALUES (${params.id}, ${payment_date}, ${payment_type}, ${amountNum}, ${notes?.trim() || null})
      RETURNING *
    `;

    // Update debt balances for principal-affecting entries.
    if (payment_type === 'principal') {
      const newPrincipal = Math.max(0, Number(debt.current_principal) - amountNum);
      await sql`UPDATE debts SET current_principal = ${newPrincipal} WHERE id = ${params.id}`;
    } else if (payment_type === 'clearance') {
      await sql`UPDATE debts SET current_principal = 0, status = 'cleared' WHERE id = ${params.id}`;
    } else if (payment_type === 'topup') {
      await sql`
        UPDATE debts
        SET
          principal = ${Number(debt.principal) + amountNum},
          current_principal = ${Number(debt.current_principal) + amountNum},
          status = 'active'
        WHERE id = ${params.id}
      `;
    }

    return NextResponse.json({ payment: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('POST /api/debts/[id]/payments error', err);
    return NextResponse.json({ error: 'Could not record transaction.' }, { status: 500 });
  }
}
