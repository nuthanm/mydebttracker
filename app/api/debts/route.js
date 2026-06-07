import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { calculateDebtInterestSummary, ensureDebtRateChangesTable, getFirstInterestMonth, normalizeEffectiveMonth } from '@/lib/debtInterest';
import {
  buildDashboardPayload,
  buildDebtSummary,
  enrichDebtWithDashboardMetrics,
  ensureDebtMetadataColumns,
  listDebtCategories,
  listDebtInstrumentTags,
  normalizeDebtCategory,
  normalizeDebtInstrumentTag,
  normalizeDebtPriority,
} from '@/lib/debtDashboard';

function sortDebtsForList(left, right) {
  if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
  const interestDiff = Number(right.interest_rate || 0) - Number(left.interest_rate || 0);
  if (interestDiff !== 0) return interestDiff;
  if (left.priority == null && right.priority != null) return 1;
  if (left.priority != null && right.priority == null) return -1;
  if (left.priority != null && right.priority != null && left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  return Number(right.outstanding_total || 0) - Number(left.outstanding_total || 0);
}

export async function GET(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await Promise.all([
    ensureDebtRateChangesTable(sql),
    ensureDebtMetadataColumns(sql),
  ]);

  const searchParams = new URL(req.url).searchParams;
  const category = normalizeDebtCategory(searchParams.get('category'));
  const instrumentTagRaw = searchParams.get('instrument_tag');
  const instrumentTag = instrumentTagRaw === 'all' ? null : normalizeDebtInstrumentTag(instrumentTagRaw);
  const fromDate = searchParams.get('from_date') || searchParams.get('from') || null;
  const toDate = searchParams.get('to_date') || searchParams.get('to') || null;
  if (Number.isNaN(instrumentTag)) {
    return NextResponse.json({ error: 'instrument_tag must be one of temp, short_term, long_term.' }, { status: 400 });
  }

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
    ORDER BY d.created_at DESC
  `;

  if (!debts.length) {
    return NextResponse.json({
      debts: [],
      categories: [],
      instrument_tags: [],
      filters: { category: category || 'all', instrument_tag: instrumentTag || 'all', from_date: fromDate, to_date: toDate },
      summary: {
        total_outstanding: 0,
        total_unpaid_interest: 0,
        total_outstanding_with_interest: 0,
        total_monthly_interest: 0,
        total_paid: 0,
        active_count: 0,
        cleared_count: 0,
      },
      dashboard: {
        by_outstanding: [],
        by_monthly_interest: [],
        by_priority: [],
        alerts: [],
        payment_range: {
          from_date: fromDate,
          to_date: toDate,
          total_outflow: 0,
          total_days: 0,
          days: [],
        },
      },
    });
  }

  const [principalPayments, rateChanges, paymentRows] = await Promise.all([
    sql`
      SELECT p.debt_id, p.payment_date, p.payment_type, p.amount
      FROM debt_payments p
      INNER JOIN debts d ON d.id = p.debt_id
      WHERE d.user_id = ${user.id}
        AND p.payment_type IN ('principal', 'clearance')
      ORDER BY p.payment_date ASC, p.created_at ASC
    `,
    sql`
      SELECT rc.debt_id, rc.effective_month, rc.interest_rate, rc.created_at
      FROM debt_rate_changes rc
      INNER JOIN debts d ON d.id = rc.debt_id
      WHERE d.user_id = ${user.id}
      ORDER BY rc.effective_month ASC, rc.created_at ASC
    `,
    sql`
      SELECT p.*, d.lender_name, d.category, d.instrument_tag
      FROM debt_payments p
      INNER JOIN debts d ON d.id = p.debt_id
      WHERE d.user_id = ${user.id}
      ORDER BY p.payment_date DESC, p.created_at DESC
    `,
  ]);

  const paymentsByDebt = principalPayments.reduce((map, payment) => {
    if (!map[payment.debt_id]) map[payment.debt_id] = [];
    map[payment.debt_id].push(payment);
    return map;
  }, {});
  const rateChangesByDebt = rateChanges.reduce((map, change) => {
    if (!map[change.debt_id]) map[change.debt_id] = [];
    map[change.debt_id].push(change);
    return map;
  }, {});

  const enrichedAllDebts = debts
    .map((debt) => ({
      ...debt,
      ...calculateDebtInterestSummary({
        debt,
        payments: paymentsByDebt[debt.id] || [],
        rateChanges: rateChangesByDebt[debt.id] || [],
      }),
    }))
    .map((debt) => enrichDebtWithDashboardMetrics(debt));

  const filteredDebts = category
    ? enrichedAllDebts.filter((debt) => debt.category === category)
    : enrichedAllDebts;
  const tagFilteredDebts = instrumentTag
    ? filteredDebts.filter((debt) => debt.instrument_tag === instrumentTag)
    : filteredDebts;
  const categoryFilteredPayments = category
    ? paymentRows.filter((payment) => payment.category === category)
    : paymentRows;
  const filteredPayments = instrumentTag
    ? categoryFilteredPayments.filter((payment) => payment.instrument_tag === instrumentTag)
    : categoryFilteredPayments;

  const sanitizedDebts = tagFilteredDebts.map((debt) => {
    const normalizedTag = normalizeDebtInstrumentTag(debt.instrument_tag);
    return {
      ...debt,
      priority: debt.priority == null ? null : normalizeDebtPriority(debt.priority),
      instrument_tag: Number.isNaN(normalizedTag) ? null : normalizedTag,
    };
  });

  return NextResponse.json({
    debts: [...sanitizedDebts].sort(sortDebtsForList),
    categories: listDebtCategories(enrichedAllDebts),
    instrument_tags: listDebtInstrumentTags(enrichedAllDebts),
    filters: {
      category: category || 'all',
      instrument_tag: instrumentTag || 'all',
      from_date: fromDate,
      to_date: toDate,
    },
    summary: buildDebtSummary(sanitizedDebts),
    dashboard: buildDashboardPayload(sanitizedDebts, filteredPayments, {
      from_date: fromDate,
      to_date: toDate,
    }),
  });
}

export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await Promise.all([
      ensureDebtRateChangesTable(sql),
      ensureDebtMetadataColumns(sql),
    ]);

    const body = await req.json();
    const { lender_name, principal, interest_rate, start_date, target_date, category, instrument_tag, priority, notes } = body;

    if (!lender_name || !principal || !interest_rate || !start_date) {
      return NextResponse.json({ error: 'lender_name, principal, interest_rate, and start_date are required.' }, { status: 400 });
    }

    const principalNum = parseFloat(principal);
    const rateNum = parseFloat(interest_rate);
    const priorityNum = normalizeDebtPriority(priority);
    const categoryName = normalizeDebtCategory(category);
    const instrumentTag = normalizeDebtInstrumentTag(instrument_tag);
    if (Number.isNaN(principalNum) || principalNum <= 0) {
      return NextResponse.json({ error: 'principal must be a positive number.' }, { status: 400 });
    }
    if (Number.isNaN(rateNum) || rateNum < 0) {
      return NextResponse.json({ error: 'interest_rate must be a non-negative number.' }, { status: 400 });
    }
    if (Number.isNaN(priorityNum)) {
      return NextResponse.json({ error: 'priority must be between 1 and 10.' }, { status: 400 });
    }
    if (Number.isNaN(instrumentTag)) {
      return NextResponse.json({ error: 'instrument_tag must be one of temp, short_term, long_term.' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO debts (user_id, lender_name, principal, current_principal, interest_rate, start_date, target_date, category, instrument_tag, priority, notes)
      VALUES (
        ${user.id},
        ${lender_name.trim()},
        ${principalNum},
        ${principalNum},
        ${rateNum},
        ${start_date},
        ${target_date || null},
        ${categoryName},
        ${instrumentTag},
        ${priorityNum},
        ${notes?.trim() || null}
      )
      RETURNING *
    `;

    await sql`
      INSERT INTO debt_rate_changes (debt_id, effective_month, interest_rate)
      VALUES (
        ${rows[0].id},
        ${normalizeEffectiveMonth(getFirstInterestMonth(start_date)) || normalizeEffectiveMonth()},
        ${rateNum}
      )
    `;

    return NextResponse.json({ debt: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('POST /api/debts error', err);
    return NextResponse.json({ error: 'Could not create debt.' }, { status: 500 });
  }
}
