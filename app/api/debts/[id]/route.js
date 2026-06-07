import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT
      d.*,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'interest'), 0) AS total_interest_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'principal'), 0) AS total_principal_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'clearance'), 0) AS total_clearance_paid,
      COALESCE(SUM(p.amount), 0) AS total_paid
    FROM debts d
    LEFT JOIN debt_payments p ON p.debt_id = d.id
    WHERE d.id = ${params.id} AND d.user_id = ${user.id}
    GROUP BY d.id
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ debt: rows[0] });
}

export async function PATCH(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { lender_name, principal, interest_rate, target_date, notes, status } = body;

    const existing = await sql`SELECT * FROM debts WHERE id = ${params.id} AND user_id = ${user.id} LIMIT 1`;
    if (!existing.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const debt = existing[0];
    let rows;
    if (principal !== undefined) {
      const principalNum = parseFloat(principal);
      if (isNaN(principalNum) || principalNum <= 0) {
        return NextResponse.json({ error: 'principal must be a positive number.' }, { status: 400 });
      }

      const repaidRows = await sql`
        SELECT COALESCE(SUM(amount), 0) AS total_repaid
        FROM debt_payments
        WHERE debt_id = ${params.id}
          AND payment_type IN ('principal', 'clearance')
      `;
      const totalRepaid = Number(repaidRows[0].total_repaid);
      if (principalNum < totalRepaid) {
        return NextResponse.json(
          { error: `principal cannot be less than already repaid amount (${totalRepaid.toFixed(2)}).` },
          { status: 400 }
        );
      }
      const currentPrincipalValue = Math.max(0, principalNum - totalRepaid);

      rows = await sql`
        UPDATE debts SET
          lender_name   = ${lender_name?.trim() ?? debt.lender_name},
          principal     = ${principalNum},
          current_principal = ${currentPrincipalValue},
          interest_rate = ${interest_rate !== undefined ? parseFloat(interest_rate) : debt.interest_rate},
          target_date   = ${target_date !== undefined ? (target_date || null) : debt.target_date},
          notes         = ${notes?.trim() !== undefined ? (notes?.trim() || null) : debt.notes},
          status        = ${status ?? debt.status}
        WHERE id = ${params.id} AND user_id = ${user.id}
        RETURNING *
      `;
    } else {
      rows = await sql`
        UPDATE debts SET
          lender_name   = ${lender_name?.trim() ?? debt.lender_name},
          interest_rate = ${interest_rate !== undefined ? parseFloat(interest_rate) : debt.interest_rate},
          target_date   = ${target_date !== undefined ? (target_date || null) : debt.target_date},
          notes         = ${notes?.trim() !== undefined ? (notes?.trim() || null) : debt.notes},
          status        = ${status ?? debt.status}
        WHERE id = ${params.id} AND user_id = ${user.id}
        RETURNING *
      `;
    }
    return NextResponse.json({ debt: rows[0] });
  } catch (err) {
    console.error('PATCH /api/debts/[id] error', err);
    return NextResponse.json({ error: 'Could not update debt.' }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await sql`SELECT id FROM debts WHERE id = ${params.id} AND user_id = ${user.id} LIMIT 1`;
  if (!existing.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await sql`DELETE FROM debts WHERE id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
