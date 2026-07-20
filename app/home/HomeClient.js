'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { toast } from '@/components/Toast';
import DebtTimeline from '@/components/DebtTimeline';
import { exportDashboardWorkbook, exportOutflowWorkbook } from '@/lib/export';
import { inr, inrShort, fmtDate } from '@/lib/format';
import { buildSnapshotFilename, copyOrDownloadElementImage, TILE_SNAPSHOT_BG } from '@/lib/clipboardImage';

function alertTone(status) {
  return status === 'overdue'
    ? 'bg-danger/10 border-danger/20 text-danger'
    : 'bg-honey-50 border-honey-600/20 text-honey-700';
}

function instrumentTagLabel(value) {
  if (value === 'temp') return 'Temp';
  if (value === 'short_term') return 'Short term';
  if (value === 'long_term') return 'Long term';
  return value || '';
}

function pct(value, max) {
  if (!max) return 0;
  return Math.max(6, Math.round((Number(value || 0) / Number(max || 1)) * 100));
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}
const DEFAULT_RANGE_DATE = todayInput();

function toPaymentDateStr(value) {
  return value ? String(value).slice(0, 10) : null;
}

function comparePaymentSchedule(left, right) {
  const leftTargetDate = toPaymentDateStr(left.target_date);
  const rightTargetDate = toPaymentDateStr(right.target_date);

  if (leftTargetDate && rightTargetDate && leftTargetDate !== rightTargetDate) {
    return leftTargetDate < rightTargetDate ? -1 : 1;
  }
  if (leftTargetDate && !rightTargetDate) return -1;
  if (!leftTargetDate && rightTargetDate) return 1;

  const leftInterestRate = Number(left.interest_rate || 0);
  const rightInterestRate = Number(right.interest_rate || 0);
  if (leftInterestRate !== rightInterestRate) {
    return leftInterestRate > rightInterestRate ? -1 : 1;
  }

  const statusDiff = (PAYMENT_SCHEDULE_RANK[left._scheduleStatus] ?? DEFAULT_SCHEDULE_RANK)
    - (PAYMENT_SCHEDULE_RANK[right._scheduleStatus] ?? DEFAULT_SCHEDULE_RANK);
  if (statusDiff !== 0) return statusDiff;

  return String(left.lender_name || '').localeCompare(String(right.lender_name || ''), undefined, { sensitivity: 'base' });
}

function getPaymentScheduleStatus(debt) {
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastPaymentDate = toPaymentDateStr(debt.last_payment_date);
  const lastTopupDate = toPaymentDateStr(debt.last_topup_date);
  const paidThisMonth = lastPaymentDate ? lastPaymentDate.slice(0, 7) === currentYM : false;
  const toppedUpThisMonth = lastTopupDate ? lastTopupDate.slice(0, 7) === currentYM : false;

  if (debt.urgency_status === 'overdue') return 'overdue';
  if (paidThisMonth) return 'paid';
  if (debt.urgency_status === 'upcoming') return 'near';
  if (!paidThisMonth && Number(debt.unpaid_interest || 0) > 0) return 'overdue';
  if (toppedUpThisMonth) return 'topup';
  return 'neutral';
}

const PAYMENT_SCHEDULE_RANK = { overdue: 0, near: 1, topup: 2, neutral: 3, paid: 4 };
const DEFAULT_SCHEDULE_RANK = 9;

const PRIORITY_BADGE_STYLES = {
  1: 'bg-danger/10 text-danger border-danger/20',
  2: 'bg-honey-50 text-honey-700 border-honey-600/20',
  3: 'bg-sky-50 text-sky-700 border-sky-600/20',
};

function PriorityBadgeIcon({ rank }) {
  const common = { width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (rank === 1) {
    return (
      <svg {...common}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  if (rank === 2) {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  if (rank === 3) {
    return (
      <svg {...common}>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    );
  }
  return null;
}

function PriorityBadge({ rank }) {
  if (!rank || rank > 3) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${PRIORITY_BADGE_STYLES[rank]}`}>
      <PriorityBadgeIcon rank={rank} />
      Priority {rank}
    </span>
  );
}

function StructuredTooltip({ title, rows, footer, width = 240 }) {
  return (
    <div
      className="absolute z-20 left-1/2 bottom-[calc(100%+8px)] -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 bg-ink text-paper text-[11px] rounded-xl px-3 py-2.5 shadow-xl leading-relaxed"
      style={{ width, minWidth: width }}
    >
      {title && <p className="font-semibold text-[12px] mb-1.5">{title}</p>}
      <div className="space-y-1">
        {rows.map((row) => (
          <p key={row.label} className="flex justify-between gap-3">
            <span className="opacity-60 shrink-0">{row.label}</span>
            <span className="font-medium text-right">{row.value}</span>
          </p>
        ))}
      </div>
      {footer && <p className="opacity-50 text-[10px] mt-2 pt-2 border-t border-paper/10">{footer}</p>}
    </div>
  );
}

function formatRate(rate) {
  const value = Number(rate || 0);
  const formatted = Number.isInteger(value) ? String(value) : String(parseFloat(value.toFixed(3)));
  return `${formatted}%`;
}

function groupDebtsByInterestRate(debts) {
  const groups = new Map();
  for (const debt of debts) {
    const rate = Number(debt.interest_rate || 0);
    const key = rate.toFixed(3);
    if (!groups.has(key)) {
      groups.set(key, { rate, debts: [], totalMonthlyInterest: 0 });
    }
    const group = groups.get(key);
    group.debts.push(debt);
    group.totalMonthlyInterest += Number(debt.current_monthly_interest || 0);
  }
  return [...groups.values()].sort((a, b) => b.rate - a.rate);
}

function buildDebtTooltipRows(debt) {
  const rows = [
    { label: 'Interest rate', value: `${debt.interest_rate}% /mo` },
    { label: 'Borrowed', value: inr(debt.principal) },
    { label: 'Current principal', value: inr(debt.current_principal) },
    { label: 'Interest paid', value: inr(debt.total_interest_paid) },
    { label: 'Principal paid', value: inr(debt.total_principal_paid) },
    { label: 'Outstanding', value: inr(debt.outstanding_total) },
    { label: 'Unpaid interest', value: inr(debt.unpaid_interest) },
    { label: 'Monthly interest', value: inr(debt.current_monthly_interest) },
  ];
  if (debt.category) rows.push({ label: 'Category', value: debt.category });
  if (debt.instrument_tag) rows.push({ label: 'Tag', value: instrumentTagLabel(debt.instrument_tag) });
  if (debt.target_date) rows.push({ label: 'Target date', value: fmtDate(debt.target_date) });
  if (debt.priority != null) rows.push({ label: 'Payoff priority', value: `P${debt.priority}` });
  if (debt.emi_amount != null) rows.push({ label: 'EMI', value: inr(debt.emi_amount) });
  return rows;
}

function sortDebtsByStartDate(debts) {
  return [...debts].sort((a, b) => {
    const left = a.start_date ? String(a.start_date).slice(0, 10) : '';
    const right = b.start_date ? String(b.start_date).slice(0, 10) : '';
    if (left && right && left !== right) return left < right ? -1 : 1;
    if (left && !right) return -1;
    if (!left && right) return 1;
    return String(a.lender_name || '').localeCompare(String(b.lender_name || ''), undefined, { sensitivity: 'base' });
  });
}

function pieData(items, key) {
  const total = items.reduce((sum, item) => sum + Number(item[key] || 0), 0);
  const CHART_COLORS = ['#A32D2D', '#2563eb', '#0F6E56', '#d97706', '#7c3aed', '#0891b2'];
  if (!total) return { gradient: 'conic-gradient(#E2DDCB 0 100%)', colors: [], total: 0 };
  let cursor = 0;
  const slices = items.slice(0, 6).map((item, index) => {
    const weight = (Number(item[key] || 0) / total) * 100;
    const from = cursor;
    cursor += weight;
    return { color: CHART_COLORS[index % CHART_COLORS.length], from, to: cursor };
  });
  return {
    gradient: `conic-gradient(${slices.map((s) => `${s.color} ${s.from}% ${s.to}%`).join(', ')})`,
    colors: slices.map((s) => s.color),
    total,
  };
}

export default function HomeClient({ user }) {
  const [debts, setDebts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [instrumentTags, setInstrumentTags] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [fromDate, setFromDate] = useState(DEFAULT_RANGE_DATE);
  const [toDate, setToDate] = useState(DEFAULT_RANGE_DATE);
  const [insightView, setInsightView] = useState('current');
  const [exporting, setExporting] = useState(false);
  const [outflowExporting, setOutflowExporting] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    if (tagFilter !== 'all') params.set('instrument_tag', tagFilter);
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);

    fetch(`/api/debts${params.toString() ? `?${params.toString()}` : ''}`)
      .then(r => r.json())
      .then((data) => {
        setDebts(data.debts || []);
        setCategories(data.categories || []);
        setInstrumentTags(data.instrument_tags || []);
        setPriorities(data.priorities || []);
        setSummary(data.summary || null);
        setDashboard(data.dashboard || null);
        setTimeline(data.timeline || []);
        setLoading(false);
      });
  }, [categoryFilter, tagFilter, priorityFilter, fromDate, toDate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const activeDebts = useMemo(() => debts.filter((debt) => debt.status === 'active'), [debts]);
  const interestRateGroups = useMemo(() => groupDebtsByInterestRate(activeDebts), [activeDebts]);
  const chronologicalDebts = useMemo(() => sortDebtsByStartDate(activeDebts), [activeDebts]);
  const paymentSchedule = useMemo(() => {
    return activeDebts
      .map((debt) => ({ ...debt, _scheduleStatus: getPaymentScheduleStatus(debt) }))
      .sort(comparePaymentSchedule);
  }, [activeDebts]);
  const empty = !loading && debts.length === 0;
  const alerts = dashboard?.alerts || [];
  const visibleAlerts = showAllAlerts ? alerts : alerts.slice(0, 2);
  const hiddenAlertsCount = Math.max(0, alerts.length - visibleAlerts.length);
  const byOutstanding = dashboard?.by_outstanding || [];
  const byInterest = dashboard?.by_monthly_interest || [];
  const byPriority = dashboard?.by_priority || [];
  const paymentDays = dashboard?.payment_range?.days || [];
  const maxOutstanding = Math.max(...byOutstanding.map((debt) => Number(debt.outstanding_total || 0)), 1);
  const maxMonthlyInterest = Math.max(...byInterest.map((debt) => Number(debt.current_monthly_interest || 0)), 1);
  const principalPaidTotal = useMemo(
    () => activeDebts.reduce((sum, debt) => sum + Number(debt.total_principal_paid || 0), 0),
    [activeDebts]
  );
  const interestPaidTotal = useMemo(
    () => activeDebts.reduce((sum, debt) => sum + Number(debt.total_interest_paid || 0), 0),
    [activeDebts]
  );
  const combinedPaidVsOutstanding = useMemo(
    () => activeDebts.reduce((acc, debt) => ({
      paid: acc.paid + Number(debt.total_paid || 0),
      outstanding: acc.outstanding + Number(debt.outstanding_total || 0),
    }), { paid: 0, outstanding: 0 }),
    [activeDebts]
  );
  const paidVsOutstandingPct = Math.max(
    1,
    Math.round((combinedPaidVsOutstanding.paid / Math.max(1, combinedPaidVsOutstanding.paid + combinedPaidVsOutstanding.outstanding)) * 100)
  );

  const handleExport = async () => {
    try {
      setExporting(true);
      exportDashboardWorkbook({
        summary: summary || {},
        debts,
        dashboard: dashboard || {},
        filters: {
          category: categoryFilter,
          instrument_tag: tagFilter,
          priority: priorityFilter,
          from_date: fromDate,
          to_date: toDate,
        },
      });
      toast('Dashboard export ready.');
    } catch (err) {
      toast('Could not export dashboard.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleOutflowExport = async () => {
    try {
      setOutflowExporting(true);
      exportOutflowWorkbook({
        days: paymentDays,
        filters: {
          category: categoryFilter,
          instrument_tag: tagFilter,
          priority: priorityFilter,
          from_date: fromDate,
          to_date: toDate,
        },
      });
      toast('Outflow grid export ready.');
    } catch (err) {
      toast('Could not export outflow.', 'error');
    } finally {
      setOutflowExporting(false);
    }
  };

  const handleCopyPaymentSchedule = async () => {
    const element = document.querySelector('[data-copy-tile="payment-schedule"]');
    if (!element) {
      toast('Could not find section to copy.', 'error');
      return;
    }

    try {
      const result = await copyOrDownloadElementImage(
        element,
        buildSnapshotFilename('payment-schedule', 'section'),
        { padding: 14, backgroundColor: TILE_SNAPSHOT_BG }
      );
      if (result === 'copied') toast('Section copied as image. Paste anywhere.');
      else toast('Clipboard unavailable. Section image downloaded.', 'info');
    } catch (finalErr) {
      toast('Could not copy section image.', 'error');
    }
  };

  const handleCopyInsights = async () => {
    const element = document.querySelector('[data-copy-tile="insights"]');
    if (!element) {
      toast('Could not find section to copy.', 'error');
      return;
    }

    try {
      const result = await copyOrDownloadElementImage(
        element,
        buildSnapshotFilename('insights', 'section'),
        { padding: 14, backgroundColor: TILE_SNAPSHOT_BG }
      );
      if (result === 'copied') toast('Insights copied as image. Paste anywhere.');
      else toast('Clipboard unavailable. Insights image downloaded.', 'info');
    } catch (finalErr) {
      toast('Could not copy insights image.', 'error');
    }
  };

  return (
    <Shell user={user}>
      {loading && (
        <div className="p-5 md:p-8">
          <div className="h-6 w-32 bg-paper-tint rounded animate-pulse mb-3" />
          <div className="h-10 w-48 bg-paper-tint rounded animate-pulse" />
        </div>
      )}

      {empty && (
        <div className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="text-center max-w-sm anim-fade">
            <div className="w-16 h-16 mx-auto rounded-full bg-ember-50 text-ember-600 flex items-center justify-center text-3xl font-light mb-4">₹</div>
            <h2 className="text-xl font-medium mb-2">Welcome, {user.name.split(' ')[0]}!</h2>
            <p className="text-sm text-ink-soft mb-6 leading-relaxed">
              Start by adding a debt you want to track — who you borrowed from, the amount, and the monthly interest.
            </p>
            <Link href="/debts/new" className="btn-primary py-2.5 px-6 rounded-lg text-sm font-medium inline-block">
              Add your first debt
            </Link>
          </div>
        </div>
      )}

      {!loading && !empty && summary && dashboard && (
        <div className="px-4 md:px-8 py-5 md:py-6 max-w-6xl mx-auto w-full space-y-5">
          <div className="space-y-3">
            <div>
              <p className="text-[11px] tracking-wider text-ink-mute uppercase">Total outstanding</p>
              <h1 className="text-3xl md:text-4xl font-medium tracking-tight mt-1">{inr(summary.total_outstanding)}</h1>
              <p className="text-sm mt-1.5 text-danger">+ {inr(summary.total_unpaid_interest)} unpaid interest</p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Category"
              className="field-input-compact min-w-0 w-auto max-w-[9.5rem] sm:max-w-none sm:min-w-[7.5rem]"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              aria-label="Tag"
              className="field-input-compact min-w-0 w-auto max-w-[7rem] sm:max-w-none sm:min-w-[6.5rem]"
            >
              <option value="all">All tags</option>
              {instrumentTags.map((tag) => (
                <option key={tag} value={tag}>{instrumentTagLabel(tag)}</option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Priority"
              className="field-input-compact min-w-0 w-auto max-w-[7.5rem] sm:max-w-none sm:min-w-[6.5rem]"
            >
              <option value="all">All priorities</option>
              <option value="none">No priority</option>
              {priorities.map((priority) => (
                <option key={priority} value={priority}>P{priority}</option>
              ))}
            </select>
            <span className="hidden sm:inline text-ink-mute/40 text-xs select-none" aria-hidden="true">|</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
              className="field-input-compact w-auto min-w-0"
            />
            <span className="text-ink-mute text-xs select-none" aria-hidden="true">–</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
              className="field-input-compact w-auto min-w-0"
            />
            <div className="hidden sm:block flex-1 min-w-2" />
            <button
              type="button"
              onClick={() => {
                setCategoryFilter('all');
                setTagFilter('all');
                setPriorityFilter('all');
                setFromDate(DEFAULT_RANGE_DATE);
                setToDate(DEFAULT_RANGE_DATE);
              }}
              className="btn-ghost py-1.5 px-3 rounded-full text-xs"
            >
              Reset
            </button>
            <button onClick={handleExport} disabled={exporting} className="btn-ghost py-1.5 px-3 rounded-full text-xs">
              {exporting ? 'Exporting…' : 'Export'}
            </button>
            <Link href="/debts" className="btn-ghost py-1.5 px-3 rounded-full text-xs">All debts</Link>
            </div>
          </div>

          {alerts.length > 0 && (
            <section className="space-y-2">
              {visibleAlerts.map((debt) => (
                <Link
                  key={debt.id}
                  href={`/debts/${debt.id}`}
                  className={`block rounded-2xl border px-4 py-3 ${alertTone(debt.urgency_status)}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-danger mt-0.5" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{debt.lender_name}</p>
                      <p className="text-xs mt-1">{debt.urgency_message} · target {fmtDate(debt.target_date)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-paper-card/70 border border-edge rounded-full px-2 py-0.5 whitespace-nowrap">
                      {debt.priority !== null && debt.priority !== undefined && debt.priority <= 3 ? (
                        <PriorityBadgeIcon rank={debt.priority} />
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      )}
                      {debt.priority !== null && debt.priority !== undefined ? `P${debt.priority}` : 'No priority'}
                    </span>
                  </div>
                </Link>
              ))}
              {alerts.length > 2 && (
                <button
                  type="button"
                  onClick={() => setShowAllAlerts((value) => !value)}
                  className="text-xs text-sky-600 hover:text-sky-700"
                >
                  {showAllAlerts ? 'Show less' : `Show ${hiddenAlertsCount} more alert${hiddenAlertsCount > 1 ? 's' : ''}`}
                </button>
              )}
            </section>
          )}

          <DebtTimeline events={timeline} />

          {interestRateGroups.length > 0 && (
            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">Interest by rate</h2>
                <span className="text-[11px] text-ink-mute">Highest to lowest · hover for breakdown</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {interestRateGroups.map((group, index) => (
                  <div
                    key={group.rate}
                    tabIndex={0}
                    className="group relative rounded-xl border border-edge bg-paper-tint p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-sky-600/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-lg font-medium text-danger">{formatRate(group.rate)}</p>
                        <p className="text-sm font-medium mt-1">{inrShort(group.totalMonthlyInterest)}<span className="text-[11px] text-ink-mute font-normal"> /mo</span></p>
                      </div>
                      <PriorityBadge rank={index + 1} />
                    </div>
                    <StructuredTooltip
                      title="From"
                      width={220}
                      rows={group.debts.map((debt) => ({
                        label: debt.lender_name,
                        value: `${inrShort(debt.current_monthly_interest)}/mo`,
                      }))}
                      footer={`${group.debts.length} debt${group.debts.length !== 1 ? 's' : ''} at ${formatRate(group.rate)}`}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {chronologicalDebts.length > 0 && (
            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">Debt timeline</h2>
                <span className="text-[11px] text-ink-mute">Oldest to newest · hover for details</span>
              </div>
              <div className="space-y-2">
                {chronologicalDebts.map((debt, index) => (
                  <Link
                    key={debt.id}
                    href={`/debts/${debt.id}`}
                    className="group relative flex items-center justify-between gap-3 rounded-xl border border-edge px-3.5 py-3 hover:bg-paper-tint transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sky-600/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{debt.lender_name}</p>
                        <PriorityBadge rank={index < 2 ? index + 1 : null} />
                      </div>
                      <p className="text-[11px] text-ink-mute mt-0.5">From {fmtDate(debt.start_date)}</p>
                    </div>
                    <StructuredTooltip
                      title={debt.lender_name}
                      width={260}
                      rows={buildDebtTooltipRows(debt)}
                      footer={debt.urgency_message || undefined}
                    />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {paymentSchedule.length > 0 && (
            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-medium">Payment Schedule</h2>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-ink-mute">All active debts</span>
                  <button
                    type="button"
                    onClick={handleCopyPaymentSchedule}
                    className="snapshot-action flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
                    title="Copy payment schedule as image"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy this section
                  </button>
                </div>
              </div>
              <div data-copy-tile="payment-schedule" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {paymentSchedule.map((debt) => {
                  const status = debt._scheduleStatus;
                  const tileClass =
                    status === 'overdue'
                      ? 'border-danger/40 bg-danger/5'
                      : status === 'near'
                        ? 'border-honey-600/30 bg-honey-50'
                        : status === 'paid'
                          ? 'border-mint-600/30 bg-mint-50'
                          : status === 'topup'
                            ? 'border-ember-600/30 bg-ember-50'
                            : 'border-edge bg-paper-tint';
                  const labelClass =
                    status === 'overdue'
                      ? 'text-danger bg-danger/10'
                      : status === 'near'
                        ? 'text-honey-600 bg-honey-50'
                        : status === 'paid'
                          ? 'text-mint-600 bg-mint-50'
                          : status === 'topup'
                            ? 'text-ember-600 bg-ember-50'
                            : 'text-ink-mute bg-paper-card';
                  const statusLabel =
                    status === 'overdue'
                      ? 'Overdue'
                      : status === 'near'
                        ? 'Due soon'
                        : status === 'paid'
                          ? 'Paid'
                          : status === 'topup'
                            ? 'Borrowed'
                            : 'Scheduled';
                  const lastPayDate = debt.last_payment_date
                    ? toPaymentDateStr(debt.last_payment_date)
                    : null;
                  return (
                    <Link
                      key={debt.id}
                      href={`/debts/${debt.id}`}
                      className={`block rounded-xl border p-3 hover:opacity-90 transition-opacity ${tileClass}`}
                    >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm font-medium truncate">{debt.lender_name}</p>
                      <span className={`flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0 ${labelClass}`}>
                        {status === 'overdue' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                        )}
                        {status === 'paid' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {status === 'topup' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <polyline points="19 12 12 5 5 12" />
                          </svg>
                        )}
                        {status === 'near' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                        )}
                        {status === 'neutral' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        )}
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex justify-between items-end gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] text-ink-mute truncate">{debt.category || 'Uncategorized'}{debt.instrument_tag ? ` · ${instrumentTagLabel(debt.instrument_tag)}` : ''}</p>
                        {status === 'overdue' && Number(debt.unpaid_interest || 0) > 0 && (
                          <p className="text-xs text-danger mt-0.5">Unpaid interest: {inrShort(debt.unpaid_interest)}</p>
                        )}
                        {status === 'paid' && lastPayDate && (
                          <p className="text-[11px] text-mint-600 mt-0.5">Last paid: {fmtDate(lastPayDate)}</p>
                        )}
                        {status === 'near' && debt.urgency_message && (
                          <p className="text-[11px] text-honey-600 mt-0.5">{debt.urgency_message}</p>
                        )}
                        {status === 'topup' && (
                          <p className="text-[11px] text-ember-600 mt-0.5">Topped up this month — no payment yet</p>
                        )}
                        {status === 'neutral' && lastPayDate && (
                          <p className="text-[11px] text-ink-mute mt-0.5">Last paid: {fmtDate(lastPayDate)}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium">{inrShort(debt.outstanding_total)}</p>
                        <p className="text-[10px] text-ink-mute">{debt.interest_rate}%/mo</p>
                      </div>
                    </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Active debts</p>
              <p className="text-lg font-medium mt-1">{summary.active_count}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Monthly interest</p>
              <p className="text-lg font-medium mt-1 text-danger">{inrShort(summary.total_monthly_interest)}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Principal paid</p>
              <p className="text-lg font-medium mt-1 text-mint-600">{inrShort(principalPaidTotal)}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Interest paid</p>
              <p className="text-lg font-medium mt-1 text-sky-600">{inrShort(interestPaidTotal)}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Selected range outflow</p>
              <p className="text-lg font-medium mt-1 text-plum-600">{inrShort(dashboard.payment_range.total_outflow)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-medium">Insights</h2>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                {['current', 'bar', 'pie'].map((mode) => (
                  <button key={mode} onClick={() => setInsightView(mode)} className={`chip text-xs ${insightView === mode ? 'on' : ''}`}>
                    {mode === 'current' ? 'Current' : mode === 'bar' ? 'Bar' : 'Pie'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCopyInsights}
                className="snapshot-action flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
                title="Copy insights as image"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </button>
            </div>
          </div>

          <div data-copy-tile="insights" className="grid xl:grid-cols-2 gap-4 md:gap-5">
            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">High to low debt details</h2>
                <span className="text-[11px] text-ink-mute">Outstanding total</span>
              </div>
              {insightView === 'pie' ? (() => {
                const pd = pieData(byOutstanding, 'outstanding_total');
                return (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative w-36 h-36 flex-shrink-0">
                      <div className="w-36 h-36 rounded-full" style={{ background: pd.gradient }} />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-16 h-16 rounded-full bg-paper-card flex flex-col items-center justify-center shadow-sm">
                          <span className="text-[9px] text-ink-mute leading-tight">Total</span>
                          <span className="text-[11px] font-medium leading-tight">{inrShort(pd.total)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-full space-y-1.5">
                      {byOutstanding.slice(0, 6).map((debt, index) => {
                        const sharePct = pd.total > 0 ? Math.round((Number(debt.outstanding_total) / pd.total) * 100) : 0;
                        return (
                          <div key={debt.id} className="flex items-center justify-between text-xs gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: pd.colors[index] }} />
                              <span className="truncate">{debt.lender_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 text-right">
                              <span className="font-medium">{inrShort(debt.outstanding_total)}</span>
                              <span className="text-[10px] text-ink-mute w-7 text-right">{sharePct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })() : insightView === 'bar' ? (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 items-end min-h-[190px]">
                  {byOutstanding.slice(0, 6).map((debt) => {
                    const height = pct(debt.outstanding_total, maxOutstanding);
                    return (
                      <Link key={debt.id} href={`/debts/${debt.id}`} className="flex flex-col items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-medium text-ink-soft">{inrShort(debt.outstanding_total)}</span>
                        <div className="w-full h-28 bg-paper-tint rounded-md overflow-hidden flex items-end">
                          <div className="w-full bg-danger/85 rounded-md" style={{ height: `${height}%` }} />
                        </div>
                        <span className="text-[10px] text-ink-mute text-center leading-tight w-full truncate">{debt.lender_name}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {byOutstanding.slice(0, 6).map((debt) => {
                    const width = pct(debt.outstanding_total, maxOutstanding);
                    return (
                      <Link key={debt.id} href={`/debts/${debt.id}`} className="block group">
                        <div className="flex justify-between text-xs mb-1 gap-2">
                          <span className="text-ink-soft truncate">{debt.lender_name}</span>
                          <span className="font-medium">{inrShort(debt.outstanding_total)}</span>
                        </div>
                        <div className={`h-2 ${insightView === 'current' ? 'bg-paper-tint' : 'bg-danger/10'} rounded-full overflow-hidden`}>
                          <div className={`fill-bar h-full ${insightView === 'current' ? 'bg-danger group-hover:bg-ember-600' : 'bg-danger/80'} rounded-full transition-colors`} style={{ width: `${width}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-ink-mute mt-1">
                          <span>{debt.category || 'Uncategorized'}{debt.priority != null ? ` · P${debt.priority}` : ''}</span>
                          <span>{inrShort(debt.current_monthly_interest)}/mo</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">Interest burden per month</h2>
                <span className="text-[11px] text-ink-mute">Aligned view</span>
              </div>
              {insightView === 'pie' ? (() => {
                const pd = pieData(byInterest, 'current_monthly_interest');
                return (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative w-36 h-36 flex-shrink-0">
                      <div className="w-36 h-36 rounded-full" style={{ background: pd.gradient }} />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-16 h-16 rounded-full bg-paper-card flex flex-col items-center justify-center shadow-sm">
                          <span className="text-[9px] text-ink-mute leading-tight">/month</span>
                          <span className="text-[11px] font-medium leading-tight">{inrShort(pd.total)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-full space-y-1.5">
                      {byInterest.slice(0, 6).map((debt, index) => {
                        const sharePct = pd.total > 0 ? Math.round((Number(debt.current_monthly_interest) / pd.total) * 100) : 0;
                        return (
                          <div key={debt.id} className="flex items-center justify-between text-xs gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: pd.colors[index] }} />
                              <span className="truncate">{debt.lender_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 text-right">
                              <span className="font-medium">{inrShort(debt.current_monthly_interest)}</span>
                              <span className="text-[10px] text-ink-mute w-7 text-right">{sharePct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })() : insightView === 'bar' ? (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 items-end min-h-[190px]">
                  {byInterest.slice(0, 6).map((debt) => {
                    const height = pct(debt.current_monthly_interest, maxMonthlyInterest);
                    return (
                      <Link key={debt.id} href={`/debts/${debt.id}`} className="flex flex-col items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-medium text-ink-soft">{inrShort(debt.current_monthly_interest)}</span>
                        <div className="w-full h-28 bg-paper-tint rounded-md overflow-hidden flex items-end">
                          <div className="w-full bg-sky-600/85 rounded-md" style={{ height: `${height}%` }} />
                        </div>
                        <span className="text-[10px] text-ink-mute text-center leading-tight w-full truncate">{debt.lender_name}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {byInterest.slice(0, 6).map((debt) => {
                    const width = pct(debt.current_monthly_interest, maxMonthlyInterest);
                    return (
                      <Link key={debt.id} href={`/debts/${debt.id}`} className="block">
                        <div className="flex items-center gap-3">
                          <div className="w-32 text-xs truncate">{debt.lender_name}</div>
                          <div className="flex-1 h-9 bg-paper-tint rounded-xl overflow-hidden relative">
                            <div className="absolute inset-y-0 left-0 bg-sky-600/85 rounded-xl" style={{ width: `${width}%` }} />
                            <div className="relative z-10 h-full px-3 flex items-center justify-between text-[11px]">
                              <span className="text-paper font-medium">{debt.interest_rate}% /mo</span>
                              <span className="font-medium text-ink">{inrShort(debt.current_monthly_interest)}</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">Outstanding vs paid so far</h2>
                <span className="text-[11px] text-ink-mute">Top active debts</span>
              </div>
              {insightView === 'pie' ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative w-36 h-36 flex-shrink-0">
                    <div
                      className="w-36 h-36 rounded-full"
                      style={{ background: `conic-gradient(#0F6E56 0 ${paidVsOutstandingPct}%, #A32D2D 0 100%)` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-16 h-16 rounded-full bg-paper-card flex flex-col items-center justify-center shadow-sm">
                        <span className="text-[11px] font-medium text-mint-600">{paidVsOutstandingPct}%</span>
                        <span className="text-[9px] text-ink-mute">paid</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-mint-600" />
                      <span className="text-ink-soft">Paid: {inrShort(combinedPaidVsOutstanding.paid)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-danger" />
                      <span className="text-ink-soft">Left: {inrShort(combinedPaidVsOutstanding.outstanding)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {byOutstanding.slice(0, 5).map((debt) => {
                    const outstanding = Number(debt.outstanding_total || 0);
                    const paid = Number(debt.total_paid || 0);
                    const total = Math.max(outstanding + paid, 1);
                    const paidPct = Math.round((paid / total) * 100);
                    const outstandingPct = 100 - paidPct;
                    return (
                      <Link key={debt.id} href={`/debts/${debt.id}`} className="block">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="truncate">{debt.lender_name}</span>
                          <span>{inrShort(paid)} paid · {inrShort(outstanding)} left</span>
                        </div>
                        <div className="h-3 flex rounded-full overflow-hidden bg-paper-tint">
                          <div className="bg-mint-600" style={{ width: `${paidPct}%` }} />
                          <div className="bg-danger" style={{ width: `${outstandingPct}%` }} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">Priority queue</h2>
                <span className="text-[11px] text-ink-mute">Optional payoff priority</span>
              </div>
              {insightView === 'pie' ? (
                <div className="space-y-2">
                  {byPriority.slice(0, 6).map((debt, index) => (
                    <p key={debt.id} className="text-xs flex justify-between"><span className="truncate pr-3">{index + 1}. {debt.lender_name}</span><span>{debt.priority != null ? `P${debt.priority}` : 'No priority'}</span></p>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {byPriority.slice(0, 6).map((debt, index) => (
                    <Link
                      key={debt.id}
                      href={`/debts/${debt.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-edge px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{index + 1}. {debt.lender_name}</p>
                        <p className="text-[11px] text-ink-mute mt-0.5">{debt.category || 'Uncategorized'}{debt.urgency_message ? ` · ${debt.urgency_message}` : ''}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium">{debt.priority != null ? `P${debt.priority}` : 'No priority'}</p>
                        <p className="text-[10px] text-danger">{inrShort(debt.outstanding_total)}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
            <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-medium">Day-wise account outflow</h2>
                <p className="text-[11px] text-ink-mute mt-1">By default this shows today's outflow. Change date filters above for another range.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-sky-600">{inr(dashboard.payment_range.total_outflow)} total</span>
                <button onClick={handleOutflowExport} disabled={outflowExporting} className="btn-ghost py-1.5 px-3 rounded-lg text-xs">
                  {outflowExporting ? 'Exporting…' : 'Export grid'}
                </button>
              </div>
            </div>

            {paymentDays.length === 0 ? (
              <p className="text-sm text-ink-mute text-center py-6">No payments found for the selected range.</p>
            ) : (
              <div className="overflow-x-auto border border-edge rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-paper-tint text-ink-soft">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-right px-3 py-2 font-medium">Payments</th>
                      <th className="text-right px-3 py-2 font-medium">Total outflow</th>
                      <th className="text-left px-3 py-2 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentDays.map((day) => (
                      <tr key={day.payment_date} className="border-t border-edge align-top">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{fmtDate(day.payment_date)}</td>
                        <td className="px-3 py-2 text-right">{day.payment_count}</td>
                        <td className="px-3 py-2 text-right font-medium text-sky-600">{inr(day.total_amount)}</td>
                        <td className="px-3 py-2">
                          <div className="space-y-1 max-w-sm">
                            {day.items.slice(0, 4).map((item, index) => (
                              <p key={`${day.payment_date}-${item.debt_id}-${index}`} className="text-[11px] text-ink-mute truncate">
                                {item.lender_name} · {item.payment_type} · {inr(item.amount)}
                              </p>
                            ))}
                            {day.items.length > 4 && <p className="text-[11px] text-ink-mute">+{day.items.length - 4} more</p>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {activeDebts.length === 0 && (
            <p className="text-sm text-ink-mute text-center py-4">No active debts 🎉</p>
          )}
        </div>
      )}
    </Shell>
  );
}
