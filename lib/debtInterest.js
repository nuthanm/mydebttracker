function makeUtcDate(year, month, day = 1) {
  return new Date(Date.UTC(year, month, day));
}

function parseDateValue(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return makeUtcDate(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (match) {
      return makeUtcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1));
    }
  }

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  return makeUtcDate(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function toMonthDate(value) {
  const date = parseDateValue(value);
  return date ? makeUtcDate(date.getUTCFullYear(), date.getUTCMonth(), 1) : null;
}

function addMonths(date, months) {
  return makeUtcDate(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}

function compareMonthDates(a, b) {
  return a.getTime() - b.getTime();
}

function monthDiffInclusive(start, end) {
  if (!start || !end) return 0;
  const diff =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  return diff > 0 ? diff : 0;
}

function formatMonthDate(value) {
  const date = toMonthDate(value);
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function formatMonthKey(value) {
  const date = toMonthDate(value);
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Business rule: interest starts only from the month after the debt start date.
export function getFirstInterestMonth(startDate) {
  const startMonth = toMonthDate(startDate);
  return startMonth ? addMonths(startMonth, 1) : null;
}

export function getCurrentMonth(value = new Date()) {
  return toMonthDate(value);
}

export function getLastCompletedInterestMonth(value = new Date()) {
  const currentMonth = getCurrentMonth(value);
  return currentMonth ? addMonths(currentMonth, -1) : null;
}

export function normalizeEffectiveMonth(value, fallback = new Date()) {
  return formatMonthDate(value || getCurrentMonth(fallback));
}

export function compareEffectiveMonths(left, right) {
  const leftMonth = toMonthDate(left);
  const rightMonth = toMonthDate(right);
  if (!leftMonth || !rightMonth) return 0;
  return compareMonthDates(leftMonth, rightMonth);
}

export async function ensureDebtRateChangesTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS debt_rate_changes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
      effective_month DATE NOT NULL,
      interest_rate NUMERIC(6,3) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_debt_rate_changes_debt
    ON debt_rate_changes(debt_id, effective_month)
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_debt_rate_changes_month
    ON debt_rate_changes(debt_id, effective_month)
  `;
}

/**
 * Ensures a debt has a starting rate-change row so later edits preserve the
 * original rate for historical month-by-month interest calculations.
 */
export async function ensureInitialRateChange(sql, debt) {
  await ensureDebtRateChangesTable(sql);

  const existing = await sql`
    SELECT id
    FROM debt_rate_changes
    WHERE debt_id = ${debt.id}
    LIMIT 1
  `;

  if (existing.length) return;

  const firstInterestMonth = formatMonthDate(getFirstInterestMonth(debt.start_date));
  if (!firstInterestMonth) return;

  await sql`
    INSERT INTO debt_rate_changes (debt_id, effective_month, interest_rate)
    VALUES (${debt.id}, ${firstInterestMonth}, ${Number(debt.interest_rate) || 0})
  `;
}

/**
 * Builds the debt interest timeline month by month.
 * Accrued interest includes only completed months, while unpaid interest is the
 * remaining accrued amount after recorded interest payments are applied oldest-first.
 */
export function calculateDebtInterestSummary({ debt, payments = [], rateChanges = [], now = new Date() }) {
  const firstInterestMonth = getFirstInterestMonth(debt.start_date);
  const currentMonth = getCurrentMonth(now);
  const lastCompletedMonth = getLastCompletedInterestMonth(now);
  const totalTopupAmount = Number(
    debt.total_topup_amount ??
    payments
      .filter((payment) => payment.payment_type === 'topup')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  );
  const totalInterestPaid = Number(
    debt.total_interest_paid ??
    payments
      .filter((payment) => payment.payment_type === 'interest')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  );

  const emptySummary = {
    current_monthly_interest: 0,
    accrued_interest: 0,
    unpaid_interest: 0,
    accrued_interest_months: 0,
    interest_start_month: formatMonthDate(firstInterestMonth),
    interest_to_month: formatMonthDate(lastCompletedMonth),
    interest_months: [],
    interest_periods: [],
  };

  if (!firstInterestMonth || !currentMonth || compareMonthDates(firstInterestMonth, currentMonth) > 0) {
    return emptySummary;
  }

  const normalizedRateChanges = [...rateChanges]
    .map((change) => {
      const effectiveMonth = toMonthDate(change.effective_month);
      if (!effectiveMonth) {
        console.warn('Skipping debt_rate_changes row with invalid effective_month', change?.debt_id || 'unknown-debt');
      }
      return {
        effectiveMonth,
        interestRate: Number(change.interest_rate || 0),
        createdAt: change.created_at ? new Date(change.created_at).getTime() : 0,
      };
    })
    .filter((change) => change.effectiveMonth)
    .sort((a, b) => compareMonthDates(a.effectiveMonth, b.effectiveMonth) || a.createdAt - b.createdAt);

  const rateByMonth = new Map();
  for (const change of normalizedRateChanges) {
    rateByMonth.set(formatMonthKey(change.effectiveMonth), change.interestRate);
  }

  const principalPayments = [...payments]
    .filter((payment) => ['principal', 'clearance', 'topup'].includes(payment.payment_type))
    .map((payment) => ({
      ...payment,
      paymentDate: parseDateValue(payment.payment_date),
      month: toMonthDate(payment.payment_date),
      createdAt: payment.created_at ? new Date(payment.created_at).getTime() : parseDateValue(payment.payment_date)?.getTime() || 0,
    }))
    .filter((payment) => payment.month && payment.paymentDate)
    // Replay same-month entries in created order so multiple records in one month
    // still produce the correct month-end principal used for interest accrual
    // (for example, a top-up followed by a repayment in the same month).
    .sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime() || a.createdAt - b.createdAt);

  if (totalTopupAmount > Number(debt.principal || 0)) {
    console.warn('Debt top-up total exceeds stored principal for debt', debt?.id || 'unknown-debt');
  }
  // `debt.principal` is the latest total borrowed amount and already includes any
  // recorded top-ups, so we subtract them here to recover the opening principal
  // before replaying top-ups and repayments month by month.
  let principal = Math.max(0, Number(debt.principal || 0) - totalTopupAmount);
  let rate = normalizedRateChanges.length
    ? normalizedRateChanges[0].interestRate
    : Number(debt.interest_rate || 0);

  for (const change of normalizedRateChanges) {
    if (compareMonthDates(change.effectiveMonth, firstInterestMonth) <= 0) {
      rate = change.interestRate;
    }
  }

  let paymentIndex = 0;
  const timelineMonths = [];
  for (let month = firstInterestMonth; compareMonthDates(month, currentMonth) <= 0; month = addMonths(month, 1)) {
    const monthKey = formatMonthKey(month);

    if (rateByMonth.has(monthKey)) {
      rate = Number(rateByMonth.get(monthKey) || 0);
    }

    while (
      paymentIndex < principalPayments.length &&
      compareMonthDates(principalPayments[paymentIndex].month, month) <= 0
    ) {
      const payment = principalPayments[paymentIndex];
      const amount = Number(payment.amount || 0);
      if (payment.payment_type === 'topup') {
        principal += amount;
      } else if (payment.payment_type === 'clearance') {
        principal = 0;
      } else {
        principal = Math.max(0, principal - amount);
      }
      paymentIndex += 1;
    }

    const interest = principal * (rate / 100);
    const isAccrued = lastCompletedMonth && compareMonthDates(month, lastCompletedMonth) <= 0;

    timelineMonths.push({
      month: formatMonthDate(month),
      principal,
      interest_rate: rate,
      interest,
      is_accrued: Boolean(isAccrued),
    });
  }

  const accruedMonths = timelineMonths.filter((month) => month.is_accrued);
  const accruedInterest = accruedMonths.reduce((sum, month) => sum + month.interest, 0);
  const unpaidInterest = Math.max(0, accruedInterest - totalInterestPaid);

  const interestPeriods = [];
  for (const month of accruedMonths) {
    const previous = interestPeriods[interestPeriods.length - 1];
    if (
      previous &&
      previous.interest_rate === month.interest_rate &&
      previous.principal === month.principal
    ) {
      previous.to_month = month.month;
      previous.months += 1;
      previous.accrued_interest += month.interest;
    } else {
      interestPeriods.push({
        from_month: month.month,
        to_month: month.month,
        months: 1,
        principal: month.principal,
        interest_rate: month.interest_rate,
        accrued_interest: month.interest,
      });
    }
  }

  let remainingInterestPaid = totalInterestPaid;
  const periodsWithPayments = interestPeriods.map((period) => {
    const paid_interest = Math.min(remainingInterestPaid, period.accrued_interest);
    remainingInterestPaid -= paid_interest;
    return {
      ...period,
      paid_interest,
      unpaid_interest: Math.max(0, period.accrued_interest - paid_interest),
    };
  });

  const currentMonthEntry = timelineMonths.find((month) => month.month === formatMonthDate(currentMonth));

  return {
    current_monthly_interest: Number(currentMonthEntry?.interest || 0),
    accrued_interest: accruedInterest,
    unpaid_interest: unpaidInterest,
    accrued_interest_months: accruedMonths.length,
    interest_start_month: formatMonthDate(firstInterestMonth),
    interest_to_month: accruedMonths.length ? accruedMonths[accruedMonths.length - 1].month : null,
    interest_months: accruedMonths,
    interest_periods: periodsWithPayments,
  };
}

/**
 * Sums accrued interest rows between two YYYY-MM or YYYY-MM-DD month values, inclusive.
 */
export function sumInterestForMonthRange(interestMonths, fromMonth, toMonth) {
  const start = normalizeEffectiveMonth(fromMonth);
  const end = normalizeEffectiveMonth(toMonth);
  if (!start || !end || compareEffectiveMonths(start, end) > 0) return 0;

  return interestMonths.reduce((sum, month) => {
    if (compareEffectiveMonths(month.month, start) >= 0 && compareEffectiveMonths(month.month, end) <= 0) {
      return sum + Number(month.interest || 0);
    }
    return sum;
  }, 0);
}

/**
 * Returns the inclusive count of accrued months between two month values.
 */
export function getAccruedMonthsCount(startMonth, endMonth) {
  return monthDiffInclusive(toMonthDate(startMonth), toMonthDate(endMonth));
}

/**
 * Minimum balance in rupees below which a debt is considered fully closed.
 * 0.005 rupees (half a paise) is sufficient to absorb floating-point rounding
 * in monthly interest and principal calculations without masking a genuinely
 * open balance.
 */
const BALANCE_EPSILON = 0.005;

/**
 * Calculates an EMI amortization schedule starting from a given opening principal.
 *
 * Each entry shows:
 *   - month_number: 1-based sequence
 *   - opening_balance: principal at the start of the month
 *   - interest: interest charged for the month
 *   - principal_portion: part of EMI applied to principal (EMI − interest)
 *   - emi: actual installment paid (may be less in the final month)
 *   - closing_balance: principal remaining after this month's payment
 *
 * The schedule stops when the balance reaches 0 or after maxMonths months.
 * If the EMI does not cover the monthly interest, only one entry is added
 * (showing the insufficient EMI) and the schedule ends, since the balance
 * would never reduce.
 * Returns an empty array when emiAmount <= 0, interestRate < 0, or principal <= 0.
 */
export function calculateEmiSchedule({ principal, interestRate, emiAmount, maxMonths = 360 }) {
  const p = Number(principal) || 0;
  const rate = Number(interestRate) || 0;
  const emi = Number(emiAmount) || 0;

  if (emi <= 0 || rate < 0 || p <= 0) return [];

  const schedule = [];
  let balance = p;

  for (let i = 1; i <= maxMonths && balance > BALANCE_EPSILON; i++) {
    const interest = balance * (rate / 100);
    const principalPortion = emi - interest;

    if (principalPortion <= 0) {
      // EMI does not cover interest; debt will never reduce — record one entry and stop.
      schedule.push({
        month_number: i,
        opening_balance: balance,
        interest,
        principal_portion: 0,
        emi,
        closing_balance: balance,
      });
      break;
    }

    const actualPrincipal = Math.min(principalPortion, balance);
    const actualEmi = interest + actualPrincipal;
    const closing = Math.max(0, balance - actualPrincipal);

    schedule.push({
      month_number: i,
      opening_balance: balance,
      interest,
      principal_portion: actualPrincipal,
      emi: actualEmi,
      closing_balance: closing,
    });

    balance = closing;
  }

  return schedule;
}

/**
 * Returns the number of months required to clear a principal at a given
 * monthly interest rate with a fixed EMI. Returns null if the EMI cannot
 * reduce the principal (i.e. EMI ≤ monthly interest).
 */
export function getMonthsToCloseWithEmi({ principal, interestRate, emiAmount }) {
  const schedule = calculateEmiSchedule({ principal, interestRate, emiAmount });
  if (!schedule.length) return null;
  const last = schedule[schedule.length - 1];
  if (last.closing_balance > BALANCE_EPSILON) return null; // did not converge
  return schedule.length;
}
