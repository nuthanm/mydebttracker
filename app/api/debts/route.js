import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const debts = await sql`
    SELECT
      d.*,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'interest'), 0) AS total_interest_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'principal'), 0) AS total_principal_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'clearance'), 0) AS total_clearance_paid,
      COALESCE(SUM(p.amount), 0) AS total_paid
    FROM debts d
    LEFT JOIN debt_payments p ON p.debt_id = d.id
    WHERE d.user_id = ${user.id}
    GROUP BY d.id
    ORDER BY d.status ASC, d.created_at DESC
  `;

  return NextResponse.json({ debts });
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { lender_name, principal, interest_rate, start_date, target_date, notes } = body;

    if (!lender_name || !principal || !interest_rate || !start_date) {
      return NextResponse.json({ error: 'lender_name, principal, interest_rate, and start_date are required.' }, { status: 400 });
    }

    const principalNum = parseFloat(principal);
    const rateNum = parseFloat(interest_rate);
    if (isNaN(principalNum) || principalNum <= 0) {
      return NextResponse.json({ error: 'principal must be a positive number.' }, { status: 400 });
    }
    if (isNaN(rateNum) || rateNum < 0) {
      return NextResponse.json({ error: 'interest_rate must be a non-negative number.' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO debts (user_id, lender_name, principal, current_principal, interest_rate, start_date, target_date, notes)
      VALUES (
        ${user.id},
        ${lender_name.trim()},
        ${principalNum},
        ${principalNum},
        ${rateNum},
        ${start_date},
        ${target_date || null},
        ${notes?.trim() || null}
      )
      RETURNING *
    `;

    return NextResponse.json({ debt: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('POST /api/debts error', err);
    return NextResponse.json({ error: 'Could not create debt.' }, { status: 500 });
  }
}
