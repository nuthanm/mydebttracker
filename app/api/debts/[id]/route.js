import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import {
  calculateDebtInterestSummary,
  compareEffectiveMonths,
  ensureDebtRateChangesTable,
  ensureInitialRateChange,
  getCurrentMonth,
  getFirstInterestMonth,
  normalizeEffectiveMonth,
} from '@/lib/debtInterest';
import {
  enrichDebtWithDashboardMetrics,
  ensureDebtMetadataColumns,
  normalizeDebtCategory,
  normalizeDebtInstrumentTag,
  normalizeDebtPriority,
} from '@/lib/debtDashboard';

export async function GET(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await Promise.all([
    ensureDebtRateChangesTable(sql),
    ensureDebtMetadataColumns(sql),
  ]);

  const rows = await sql`
    SELECT
      d.*,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'interest'), 0) AS total_interest_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'principal'), 0) AS total_principal_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'clearance'), 0) AS total_clearance_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'topup'), 0) AS total_topup_amount,
      COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type IN ('interest', 'principal', 'clearance')), 0) AS total_paid
    FROM debts d
    LEFT JOIN debt_payments p ON p.debt_id = d.id
    WHERE d.id = ${params.id} AND d.user_id = ${user.id}
    GROUP BY d.id
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const [payments, rateChanges] = await Promise.all([
    sql`
      SELECT payment_date, payment_type, amount, created_at
      FROM debt_payments
      WHERE debt_id = ${params.id}
      ORDER BY payment_date ASC, created_at ASC
    `,
    sql`
      SELECT effective_month, interest_rate, created_at
      FROM debt_rate_changes
      WHERE debt_id = ${params.id}
      ORDER BY effective_month ASC, created_at ASC
    `,
  ]);

  const debt = enrichDebtWithDashboardMetrics({
    ...rows[0],
    ...calculateDebtInterestSummary({
      debt: rows[0],
      payments,
      rateChanges,
    }),
    rate_changes: rateChanges,
  });

  return NextResponse.json({ debt });
}

export async function PATCH(req, { params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await Promise.all([
      ensureDebtRateChangesTable(sql),
      ensureDebtMetadataColumns(sql),
    ]);

    const body = await req.json();
    const { lender_name, principal, interest_rate, rate_effective_month, target_date, category, instrument_tag, priority, notes, status } = body;

    const existing = await sql`SELECT * FROM debts WHERE id = ${params.id} AND user_id = ${user.id} LIMIT 1`;
    if (!existing.length) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const debt = existing[0];
    const currentRate = Number(debt.interest_rate || 0);
    const nextRate = interest_rate !== undefined ? parseFloat(interest_rate) : currentRate;
    const nextPriority = priority !== undefined ? normalizeDebtPriority(priority) : (debt.priority == null ? null : Number(debt.priority));
    const nextCategory = category !== undefined ? normalizeDebtCategory(category) : debt.category;
    const nextInstrumentTag = instrument_tag !== undefined ? normalizeDebtInstrumentTag(instrument_tag) : debt.instrument_tag;

    if (interest_rate !== undefined && (Number.isNaN(nextRate) || nextRate < 0)) {
      return NextResponse.json({ error: 'interest_rate must be a non-negative number.' }, { status: 400 });
    }
    if (Number.isNaN(nextPriority)) {
      return NextResponse.json({ error: 'priority must be between 1 and 10.' }, { status: 400 });
    }
    if (Number.isNaN(nextInstrumentTag)) {
      return NextResponse.json({ error: 'instrument_tag must be one of temp, short_term, long_term.' }, { status: 400 });
    }

    const rateHasChanged = interest_rate !== undefined && nextRate !== currentRate;
    let effectiveMonth = null;

    if (rateHasChanged) {
      effectiveMonth = normalizeEffectiveMonth(rate_effective_month);
      if (!effectiveMonth) {
        return NextResponse.json({ error: 'Provide a valid effective month for the new interest rate.' }, { status: 400 });
      }

      const firstInterestMonth = normalizeEffectiveMonth(getFirstInterestMonth(debt.start_date));
      const currentMonth = normalizeEffectiveMonth(getCurrentMonth());
      if (firstInterestMonth && compareEffectiveMonths(effectiveMonth, firstInterestMonth) < 0) {
        return NextResponse.json(
          { error: `Effective month cannot be earlier than ${(firstInterestMonth || '').slice(0, 7) || 'the first interest month'}.` },
          { status: 400 }
        );
      }
      if (currentMonth && compareEffectiveMonths(effectiveMonth, currentMonth) > 0) {
        return NextResponse.json({ error: 'Effective month cannot be in the future.' }, { status: 400 });
      }
    }

    let rows;
    if (principal !== undefined) {
      const principalNum = parseFloat(principal);
      if (Number.isNaN(principalNum) || principalNum <= 0) {
        return NextResponse.json({ error: 'principal must be a positive number.' }, { status: 400 });
      }

      const repaidRows = await sql`
        SELECT COALESCE(SUM(amount), 0) AS total_repaid
        FROM debt_payments
        WHERE debt_id = ${params.id}
          AND payment_type IN ('principal', 'clearance')
      `;
        const topupRows = await sql`
          SELECT COALESCE(SUM(amount), 0) AS total_topup
          FROM debt_payments
          WHERE debt_id = ${params.id}
            AND payment_type = 'topup'
        `;
        const totalRepaid = Number(repaidRows[0].total_repaid);
        const totalTopup = Number(topupRows[0].total_topup);
        if (principalNum < totalRepaid) {
          return NextResponse.json(
            { error: `principal cannot be less than already repaid amount (${totalRepaid.toFixed(2)}).` },
            { status: 400 }
          );
        }
        if (principalNum < totalTopup) {
          return NextResponse.json(
            { error: `principal cannot be less than extra borrowed amount already recorded (${totalTopup.toFixed(2)}).` },
            { status: 400 }
          );
        }
        const currentPrincipalValue = Math.max(0, principalNum - totalRepaid);

      rows = await sql`
        UPDATE debts SET
          lender_name   = ${lender_name?.trim() ?? debt.lender_name},
          principal     = ${principalNum},
          current_principal = ${currentPrincipalValue},
          interest_rate = ${nextRate},
          target_date   = ${target_date !== undefined ? (target_date || null) : debt.target_date},
          category      = ${nextCategory},
          instrument_tag = ${nextInstrumentTag},
          priority      = ${nextPriority},
          notes         = ${notes?.trim() !== undefined ? (notes?.trim() || null) : debt.notes},
          status        = ${status ?? debt.status}
        WHERE id = ${params.id} AND user_id = ${user.id}
        RETURNING *
      `;
    } else {
      rows = await sql`
        UPDATE debts SET
          lender_name   = ${lender_name?.trim() ?? debt.lender_name},
          interest_rate = ${nextRate},
          target_date   = ${target_date !== undefined ? (target_date || null) : debt.target_date},
          category      = ${nextCategory},
          instrument_tag = ${nextInstrumentTag},
          priority      = ${nextPriority},
          notes         = ${notes?.trim() !== undefined ? (notes?.trim() || null) : debt.notes},
          status        = ${status ?? debt.status}
        WHERE id = ${params.id} AND user_id = ${user.id}
        RETURNING *
      `;
    }

    if (rateHasChanged) {
      await ensureInitialRateChange(sql, debt);
      await sql`
        INSERT INTO debt_rate_changes (debt_id, effective_month, interest_rate)
        VALUES (${params.id}, ${effectiveMonth}, ${nextRate})
        ON CONFLICT (debt_id, effective_month)
        DO UPDATE SET interest_rate = EXCLUDED.interest_rate
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
