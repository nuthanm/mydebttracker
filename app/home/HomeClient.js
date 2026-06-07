'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { toast } from '@/components/Toast';
import { exportDashboardWorkbook, exportOutflowWorkbook } from '@/lib/export';
import { inr, inrShort, fmtDate } from '@/lib/format';

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

function pieGradient(items, key) {
  const total = items.reduce((sum, item) => sum + Number(item[key] || 0), 0);
  if (!total) return 'conic-gradient(#E2DDCB 0 100%)';
  const colors = ['#A32D2D', '#2563eb', '#0F6E56', '#d97706', '#7c3aed', '#0891b2'];
  let cursor = 0;
  const segments = items.slice(0, 6).map((item, index) => {
    const weight = (Number(item[key] || 0) / total) * 100;
    const from = cursor;
    cursor += weight;
    return `${colors[index % colors.length]} ${from}% ${cursor}%`;
  });
  return `conic-gradient(${segments.join(', ')})`;
}

export default function HomeClient({ user }) {
  const [debts, setDebts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [instrumentTags, setInstrumentTags] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dashboard, setDashboard] = useState(null);
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
        setLoading(false);
      });
  }, [categoryFilter, tagFilter, priorityFilter, fromDate, toDate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const activeDebts = useMemo(() => debts.filter((debt) => debt.status === 'active'), [debts]);
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] tracking-wider text-ink-mute uppercase">Total outstanding</p>
              <h1 className="text-3xl md:text-4xl font-medium tracking-tight mt-1">{inr(summary.total_outstanding)}</h1>
              <p className="text-sm mt-1.5 text-danger">+ {inr(summary.total_unpaid_interest)} unpaid interest</p>
            </div>

            <div className="flex-1 max-w-3xl">
              <div className="bg-paper-card border border-edge rounded-2xl p-3.5 md:p-4 space-y-3">
                <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-2">
                  <label className="text-[11px] text-ink-mute">
                    Category
                    <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="field-input mt-1 min-w-0">
                      <option value="all">All categories</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] text-ink-mute">
                    Tag
                    <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="field-input mt-1 min-w-0">
                      <option value="all">All tags</option>
                      {instrumentTags.map((tag) => (
                        <option key={tag} value={tag}>{instrumentTagLabel(tag)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] text-ink-mute">
                    Priority
                    <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="field-input mt-1 min-w-0">
                      <option value="all">All priorities</option>
                      <option value="none">No priority</option>
                      {priorities.map((priority) => (
                        <option key={priority} value={priority}>P{priority}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] text-ink-mute">
                    From date
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="field-input mt-1" />
                  </label>
                  <label className="text-[11px] text-ink-mute">
                    To date
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="field-input mt-1" />
                  </label>
                </div>
                <div className="flex gap-2 justify-end flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter('all');
                      setTagFilter('all');
                      setPriorityFilter('all');
                      setFromDate(DEFAULT_RANGE_DATE);
                      setToDate(DEFAULT_RANGE_DATE);
                    }}
                    className="btn-ghost py-2 px-4 rounded-full text-sm"
                  >
                    Reset filters
                  </button>
                  <button onClick={handleExport} disabled={exporting} className="btn-ghost py-2 px-4 rounded-full text-sm">
                    {exporting ? 'Exporting…' : 'Export Excel'}
                  </button>
                  <Link href="/debts" className="btn-ghost py-2 px-4 rounded-full text-sm">See all debts</Link>
                  <Link href="/debts/new" className="inline-flex items-center gap-1.5 btn-primary py-2 px-4 rounded-full text-sm font-medium">
                    + Add debt
                  </Link>
                </div>
              </div>
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
                    <span className="text-[10px] font-medium bg-paper-card/70 border border-edge rounded-full px-2 py-0.5 whitespace-nowrap">
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
            <div className="flex gap-2">
              {['current', 'bar', 'pie'].map((mode) => (
                <button key={mode} onClick={() => setInsightView(mode)} className={`chip text-xs ${insightView === mode ? 'on' : ''}`}>
                  {mode === 'current' ? 'Current' : mode === 'bar' ? 'Bar' : 'Pie'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-4 md:gap-5">
            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">High to low debt details</h2>
                <span className="text-[11px] text-ink-mute">Outstanding total</span>
              </div>
              {insightView === 'pie' ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-36 h-36 rounded-full" style={{ background: pieGradient(byOutstanding, 'outstanding_total') }} />
                  <div className="w-full space-y-1">
                    {byOutstanding.slice(0, 6).map((debt) => (
                      <p key={debt.id} className="text-xs flex justify-between"><span className="truncate pr-3">{debt.lender_name}</span><span>{inrShort(debt.outstanding_total)}</span></p>
                    ))}
                  </div>
                </div>
              ) : insightView === 'bar' ? (
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
              {insightView === 'pie' ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-36 h-36 rounded-full" style={{ background: pieGradient(byInterest, 'current_monthly_interest') }} />
                  <div className="w-full space-y-1">
                    {byInterest.slice(0, 6).map((debt) => (
                      <p key={debt.id} className="text-xs flex justify-between"><span className="truncate pr-3">{debt.lender_name}</span><span>{inrShort(debt.current_monthly_interest)}</span></p>
                    ))}
                  </div>
                </div>
              ) : insightView === 'bar' ? (
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
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="w-36 h-36 rounded-full"
                    style={{
                      background: `conic-gradient(#0F6E56 0 ${paidVsOutstandingPct}%, #A32D2D 0 100%)`,
                    }}
                  />
                  <p className="text-xs">Paid vs outstanding (combined)</p>
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
