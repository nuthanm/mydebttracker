const UPCOMING_TARGET_DAYS = 14;
const DEBT_INSTRUMENT_TAG_VALUES = ['temp', 'short_term', 'long_term'];
const DEBT_INSTRUMENT_TAG_SET = new Set(DEBT_INSTRUMENT_TAG_VALUES);

export async function ensureDebtMetadataColumns(sql) {
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS category TEXT`;
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS priority INTEGER`;
  await sql`ALTER TABLE debts ADD COLUMN IF NOT EXISTS instrument_tag TEXT`;
}

export function normalizeDebtCategory(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function normalizeDebtPriority(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10) return NaN;
  return parsed;
}

export function normalizeDebtInstrumentTag(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized) return null;
  return DEBT_INSTRUMENT_TAG_SET.has(normalized) ? normalized : NaN;
}

function startOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayDiff(targetDate, now = new Date()) {
  const target = startOfDay(targetDate);
  const today = startOfDay(now);
  if (!target || !today) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function getDebtUrgency(debt, now = new Date()) {
  if (!debt?.target_date || debt?.status === 'cleared') {
    return {
      urgency_status: 'none',
      urgency_days_left: null,
      urgency_message: null,
    };
  }

  const daysLeft = dayDiff(debt.target_date, now);
  if (daysLeft === null) {
    return {
      urgency_status: 'none',
      urgency_days_left: null,
      urgency_message: null,
    };
  }

  if (daysLeft < 0) {
    return {
      urgency_status: 'overdue',
      urgency_days_left: daysLeft,
      urgency_message: `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue`,
    };
  }

  if (daysLeft <= UPCOMING_TARGET_DAYS) {
    return {
      urgency_status: 'upcoming',
      urgency_days_left: daysLeft,
      urgency_message: daysLeft === 0 ? 'Due today' : `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    };
  }

  return {
    urgency_status: 'none',
    urgency_days_left: daysLeft,
    urgency_message: null,
  };
}

export function enrichDebtWithDashboardMetrics(debt, now = new Date()) {
  const unpaidInterest = Number(debt.unpaid_interest || 0);
  const currentPrincipal = Number(debt.current_principal || 0);
  const totalPaid = Number(debt.total_paid || 0);
  const totalInterestPaid = Number(debt.total_interest_paid || 0);
  const totalPrincipalPaid = Number(debt.total_principal_paid || 0);
  const totalClearancePaid = Number(debt.total_clearance_paid || 0);
  const totalTopupAmount = Number(debt.total_topup_amount || 0);
  const currentMonthlyInterest = Number(debt.current_monthly_interest || 0);
  const outstandingTotal = currentPrincipal + unpaidInterest;
  const urgency = getDebtUrgency(debt, now);

  return {
    ...debt,
    category: debt.category || null,
    priority: debt.priority === null || debt.priority === undefined ? null : Number(debt.priority),
    instrument_tag: debt.instrument_tag || null,
    total_paid: totalPaid,
    total_interest_paid: totalInterestPaid,
    total_principal_paid: totalPrincipalPaid,
    total_clearance_paid: totalClearancePaid,
    total_topup_amount: totalTopupAmount,
    current_monthly_interest: currentMonthlyInterest,
    unpaid_interest: unpaidInterest,
    outstanding_total: outstandingTotal,
    ...urgency,
  };
}

function comparePriority(left, right) {
  if (left.priority == null && right.priority == null) return 0;
  if (left.priority == null) return 1;
  if (right.priority == null) return -1;
  return left.priority - right.priority;
}

function sortByOutstanding(left, right) {
  return Number(right.outstanding_total || 0) - Number(left.outstanding_total || 0);
}

function sortByInterest(left, right) {
  return Number(right.current_monthly_interest || 0) - Number(left.current_monthly_interest || 0);
}

function sortByUrgency(left, right) {
  const rank = { overdue: 0, upcoming: 1, none: 2 };
  const diff = (rank[left.urgency_status] ?? 9) - (rank[right.urgency_status] ?? 9);
  if (diff !== 0) return diff;
  return (left.urgency_days_left ?? 9999) - (right.urgency_days_left ?? 9999);
}

function isWithinRange(dateValue, fromDate, toDate) {
  const current = startOfDay(dateValue);
  if (!current) return false;
  if (fromDate && current < fromDate) return false;
  if (toDate && current > toDate) return false;
  return true;
}

export function buildDashboardPayload(debts, paymentRows, filters = {}) {
  const fromDate = filters.from_date ? startOfDay(filters.from_date) : null;
  const toDate = filters.to_date ? startOfDay(filters.to_date) : null;
  const activeDebts = debts.filter((debt) => debt.status === 'active');

  // Exclude extra borrowing entries from payment activity because this chart is
  // intended to show money paid out, not additional amounts borrowed.
  const filteredPayments = paymentRows.filter((payment) => payment.payment_type !== 'topup' && isWithinRange(payment.payment_date, fromDate, toDate));
  const dailyMap = new Map();

  for (const payment of filteredPayments) {
    const key = toDateKey(payment.payment_date);
    if (!key) continue;
    const existing = dailyMap.get(key) || { payment_date: key, total_amount: 0, payment_count: 0, items: [] };
    existing.total_amount += Number(payment.amount || 0);
    existing.payment_count += 1;
    existing.items.push({
      debt_id: payment.debt_id,
      lender_name: payment.lender_name,
      category: payment.category || null,
      instrument_tag: payment.instrument_tag || null,
      payment_type: payment.payment_type,
      amount: Number(payment.amount || 0),
      notes: payment.notes || null,
    });
    dailyMap.set(key, existing);
  }

  const paymentDays = Array.from(dailyMap.values()).sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  const totalOutflow = paymentDays.reduce((sum, day) => sum + day.total_amount, 0);

  return {
    by_outstanding: [...activeDebts].sort((left, right) => sortByOutstanding(left, right) || comparePriority(left, right)),
    by_monthly_interest: [...activeDebts].sort((left, right) => sortByInterest(left, right) || sortByOutstanding(left, right)),
    by_priority: [...activeDebts].sort((left, right) => comparePriority(left, right) || sortByOutstanding(left, right)),
    alerts: [...activeDebts].filter((debt) => debt.urgency_status !== 'none').sort((left, right) => sortByUrgency(left, right) || comparePriority(left, right)),
    payment_range: {
      from_date: filters.from_date || null,
      to_date: filters.to_date || null,
      total_outflow: totalOutflow,
      total_days: paymentDays.length,
      days: paymentDays,
    },
  };
}

export function buildDebtSummary(debts) {
  const activeDebts = debts.filter((debt) => debt.status === 'active');
  const clearedDebts = debts.filter((debt) => debt.status === 'cleared');

  return {
    total_outstanding: activeDebts.reduce((sum, debt) => sum + Number(debt.current_principal || 0), 0),
    total_unpaid_interest: activeDebts.reduce((sum, debt) => sum + Number(debt.unpaid_interest || 0), 0),
    total_outstanding_with_interest: activeDebts.reduce((sum, debt) => sum + Number(debt.outstanding_total || 0), 0),
    total_monthly_interest: activeDebts.reduce((sum, debt) => sum + Number(debt.current_monthly_interest || 0), 0),
    total_paid: debts.reduce((sum, debt) => sum + Number(debt.total_paid || 0), 0),
    active_count: activeDebts.length,
    cleared_count: clearedDebts.length,
  };
}

export function listDebtCategories(debts) {
  return Array.from(new Set(debts.map((debt) => debt.category).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function listDebtInstrumentTags(debts) {
  const present = new Set(debts.map((debt) => debt.instrument_tag).filter(Boolean));
  return DEBT_INSTRUMENT_TAG_VALUES.filter((tag) => present.has(tag));
}

export { UPCOMING_TARGET_DAYS };
