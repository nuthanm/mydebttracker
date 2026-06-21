import * as XLSX from 'xlsx';

function appendJsonSheet(workbook, name, rows) {
  const safeRows = rows.length ? rows : [{ info: 'No data' }];
  const sheet = XLSX.utils.json_to_sheet(safeRows);
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function fileSafe(value) {
  return String(value || 'export')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'export';
}

export function exportDashboardWorkbook({ summary, debts, dashboard, filters }) {
  const workbook = XLSX.utils.book_new();

  appendJsonSheet(workbook, 'Summary', [{
    category_filter: filters.category || 'all',
    instrument_tag_filter: filters.instrument_tag || 'all',
    priority_filter: filters.priority || 'all',
    from_date: filters.from_date || '',
    to_date: filters.to_date || '',
    total_outstanding: Number(summary.total_outstanding || 0),
    unpaid_interest: Number(summary.total_unpaid_interest || 0),
    total_outstanding_with_interest: Number(summary.total_outstanding_with_interest || 0),
    total_monthly_interest: Number(summary.total_monthly_interest || 0),
    total_paid: Number(summary.total_paid || 0),
    active_count: Number(summary.active_count || 0),
    cleared_count: Number(summary.cleared_count || 0),
    range_outflow: Number(dashboard.payment_range?.total_outflow || 0),
  }]);

  appendJsonSheet(workbook, 'Debts', debts.map((debt) => ({
    lender_name: debt.lender_name,
    category: debt.category || '',
    instrument_tag: debt.instrument_tag || '',
    priority: debt.priority ?? '',
    status: debt.status,
    start_date: debt.start_date,
    target_date: debt.target_date || '',
    urgency_status: debt.urgency_status,
    urgency_message: debt.urgency_message || '',
    principal: Number(debt.principal || 0),
    current_principal: Number(debt.current_principal || 0),
    interest_rate: Number(debt.interest_rate || 0),
    current_monthly_interest: Number(debt.current_monthly_interest || 0),
    total_interest_paid: Number(debt.total_interest_paid || 0),
    total_principal_paid: Number(debt.total_principal_paid || 0),
    total_paid: Number(debt.total_paid || 0),
    unpaid_interest: Number(debt.unpaid_interest || 0),
    outstanding_total: Number(debt.outstanding_total || 0),
  })));

  appendJsonSheet(workbook, 'Outstanding Ranking', (dashboard.by_outstanding || []).map((debt, index) => ({
    rank: index + 1,
    lender_name: debt.lender_name,
    category: debt.category || '',
    instrument_tag: debt.instrument_tag || '',
    priority: debt.priority ?? '',
    outstanding_total: Number(debt.outstanding_total || 0),
    current_principal: Number(debt.current_principal || 0),
    unpaid_interest: Number(debt.unpaid_interest || 0),
  })));

  appendJsonSheet(workbook, 'Monthly Interest', (dashboard.by_monthly_interest || []).map((debt, index) => ({
    rank: index + 1,
    lender_name: debt.lender_name,
    category: debt.category || '',
    instrument_tag: debt.instrument_tag || '',
    monthly_interest: Number(debt.current_monthly_interest || 0),
    interest_rate: Number(debt.interest_rate || 0),
    total_interest_paid: Number(debt.total_interest_paid || 0),
  })));

  appendJsonSheet(workbook, 'Priority Queue', (dashboard.by_priority || []).map((debt, index) => ({
    queue_position: index + 1,
    lender_name: debt.lender_name,
    priority: debt.priority ?? '',
    category: debt.category || '',
    instrument_tag: debt.instrument_tag || '',
    outstanding_total: Number(debt.outstanding_total || 0),
    urgency_status: debt.urgency_status,
    urgency_message: debt.urgency_message || '',
  })));

  appendJsonSheet(workbook, 'Paid vs Outstanding', debts.map((debt) => ({
    lender_name: debt.lender_name,
    total_paid: Number(debt.total_paid || 0),
    outstanding_total: Number(debt.outstanding_total || 0),
    unpaid_interest: Number(debt.unpaid_interest || 0),
  })));

  appendJsonSheet(workbook, 'Daily Outflow', (dashboard.payment_range?.days || []).flatMap((day) => {
    if (!day.items?.length) {
      return [{ payment_date: day.payment_date, total_amount: Number(day.total_amount || 0), payment_count: Number(day.payment_count || 0) }];
    }
    return day.items.map((item, index) => ({
      payment_date: day.payment_date,
      total_amount: index === 0 ? Number(day.total_amount || 0) : '',
      payment_count: index === 0 ? Number(day.payment_count || 0) : '',
      lender_name: item.lender_name,
      category: item.category || '',
      instrument_tag: item.instrument_tag || '',
      payment_type: item.payment_type,
      amount: Number(item.amount || 0),
      notes: item.notes || '',
    }));
  }));

  appendJsonSheet(workbook, 'Alerts', (dashboard.alerts || []).map((debt) => ({
    lender_name: debt.lender_name,
    category: debt.category || '',
    instrument_tag: debt.instrument_tag || '',
    priority: debt.priority ?? '',
    target_date: debt.target_date || '',
    urgency_status: debt.urgency_status,
    urgency_message: debt.urgency_message || '',
    outstanding_total: Number(debt.outstanding_total || 0),
  })));

  XLSX.writeFile(workbook, `dashboard-${fileSafe(filters.category || 'all')}.xlsx`);
}

export function exportOutflowWorkbook({ days, filters }) {
  const workbook = XLSX.utils.book_new();
  appendJsonSheet(workbook, 'Outflow Summary', [{
    category_filter: filters.category || 'all',
    instrument_tag_filter: filters.instrument_tag || 'all',
    priority_filter: filters.priority || 'all',
    from_date: filters.from_date || '',
    to_date: filters.to_date || '',
    total_days: Number(days?.length || 0),
    total_outflow: Number((days || []).reduce((sum, day) => sum + Number(day.total_amount || 0), 0)),
  }]);

  appendJsonSheet(workbook, 'Outflow Grid', (days || []).flatMap((day) => {
    if (!day.items?.length) {
      return [{
        payment_date: day.payment_date,
        payment_count: Number(day.payment_count || 0),
        total_amount: Number(day.total_amount || 0),
      }];
    }
    return day.items.map((item, index) => ({
      payment_date: day.payment_date,
      payment_count: index === 0 ? Number(day.payment_count || 0) : '',
      total_amount: index === 0 ? Number(day.total_amount || 0) : '',
      lender_name: item.lender_name,
      category: item.category || '',
      instrument_tag: item.instrument_tag || '',
      payment_type: item.payment_type,
      amount: Number(item.amount || 0),
      notes: item.notes || '',
    }));
  }));

  XLSX.writeFile(workbook, `outflow-grid-${fileSafe(filters.from_date || 'today')}.xlsx`);
}

export function exportDebtWorkbook({ debt, payments }) {
  const workbook = XLSX.utils.book_new();

  appendJsonSheet(workbook, 'Debt Summary', [{
    lender_name: debt.lender_name,
    category: debt.category || '',
    instrument_tag: debt.instrument_tag || '',
    priority: debt.priority ?? '',
    status: debt.status,
    start_date: debt.start_date,
    target_date: debt.target_date || '',
    urgency_status: debt.urgency_status,
    urgency_message: debt.urgency_message || '',
    notes: debt.notes || '',
    principal: Number(debt.principal || 0),
    current_principal: Number(debt.current_principal || 0),
    interest_rate: Number(debt.interest_rate || 0),
    current_monthly_interest: Number(debt.current_monthly_interest || 0),
    total_paid: Number(debt.total_paid || 0),
    total_interest_paid: Number(debt.total_interest_paid || 0),
    total_principal_paid: Number(debt.total_principal_paid || 0),
    total_topup_amount: Number(debt.total_topup_amount || 0),
    unpaid_interest: Number(debt.unpaid_interest || 0),
    outstanding_total: Number(debt.outstanding_total || 0),
  }]);

  appendJsonSheet(workbook, 'Interest Timeline', (debt.interest_periods || []).map((period) => ({
    from_month: period.from_month,
    to_month: period.to_month,
    months: Number(period.months || 0),
    principal: Number(period.principal || 0),
    interest_rate: Number(period.interest_rate || 0),
    accrued_interest: Number(period.accrued_interest || 0),
    paid_interest: Number(period.paid_interest || 0),
    unpaid_interest: Number(period.unpaid_interest || 0),
  })));

  appendJsonSheet(workbook, 'Monthly Interest', (debt.interest_months || []).map((month) => ({
    month: month.month,
    principal: Number(month.principal || 0),
    interest_rate: Number(month.interest_rate || 0),
    interest: Number(month.interest || 0),
    is_accrued: Boolean(month.is_accrued),
  })));

  appendJsonSheet(workbook, 'Transactions', payments.map((payment) => ({
    payment_date: payment.payment_date,
    payment_type: payment.payment_type,
    amount: Number(payment.amount || 0),
    notes: payment.notes || '',
  })));

  XLSX.writeFile(workbook, `debt-${fileSafe(debt.lender_name)}.xlsx`);
}
