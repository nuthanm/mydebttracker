'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { toast } from '@/components/Toast';
import { exportDashboardWorkbook } from '@/lib/export';
import { inr, inrShort, fmtDate } from '@/lib/format';

function alertTone(status) {
  return status === 'overdue'
    ? 'bg-danger/10 border-danger/20 text-danger'
    : 'bg-honey-50 border-honey-600/20 text-honey-600';
}

function instrumentTagLabel(value) {
  if (value === 'temp') return 'Temp';
  if (value === 'short_term') return 'Short term';
  if (value === 'long_term') return 'Long term';
  return value || '';
}

function debtTooltip(debt) {
  return [
    `${debt.lender_name}`,
    `Outstanding: ${inr(debt.outstanding_total || 0)}`,
    `Current principal: ${inr(debt.current_principal || 0)}`,
    `Monthly interest: ${inr(debt.current_monthly_interest || 0)}`,
    debt.instrument_tag ? `Debt tag: ${instrumentTagLabel(debt.instrument_tag)}` : null,
    `Interest paid: ${inr(debt.total_interest_paid || 0)}`,
    `Paid so far: ${inr(debt.total_paid || 0)}`,
    `Unpaid interest: ${inr(debt.unpaid_interest || 0)}`,
    debt.target_date ? `Target date: ${fmtDate(debt.target_date)}` : null,
    debt.urgency_message || null,
  ].filter(Boolean).join('\n');
}

export default function HomeClient({ user }) {
  const [debts, setDebts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [instrumentTags, setInstrumentTags] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [exporting, setExporting] = useState(false);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    if (tagFilter !== 'all') params.set('instrument_tag', tagFilter);
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);

    fetch(`/api/debts${params.toString() ? `?${params.toString()}` : ''}`)
      .then(r => r.json())
      .then((data) => {
        setDebts(data.debts || []);
        setCategories(data.categories || []);
        setInstrumentTags(data.instrument_tags || []);
        setSummary(data.summary || null);
        setDashboard(data.dashboard || null);
        setLoading(false);
      });
  }, [categoryFilter, tagFilter, fromDate, toDate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const activeDebts = useMemo(() => debts.filter((debt) => debt.status === 'active'), [debts]);
  const empty = !loading && debts.length === 0;
  const alerts = dashboard?.alerts || [];
  const byOutstanding = dashboard?.by_outstanding || [];
  const byInterest = dashboard?.by_monthly_interest || [];
  const byPriority = dashboard?.by_priority || [];
  const paymentDays = dashboard?.payment_range?.days || [];
  const maxOutstanding = Math.max(...byOutstanding.map((debt) => Number(debt.outstanding_total || 0)), 1);
  const maxMonthlyInterest = Math.max(...byInterest.map((debt) => Number(debt.current_monthly_interest || 0)), 1);

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

            <div className="flex flex-col gap-2 lg:items-end">
              <div className="grid sm:grid-cols-4 gap-2">
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="field-input min-w-[160px]">
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="field-input min-w-[140px]">
                  <option value="all">All tags</option>
                  {instrumentTags.map((tag) => (
                    <option key={tag} value={tag}>{instrumentTagLabel(tag)}</option>
                  ))}
                </select>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="field-input" />
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="field-input" />
              </div>
              <p className="text-[11px] text-ink-mute">
                Use debt tags (Temp, Short term, Long term) to quickly filter the dashboard to matching instruments only.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={handleExport} disabled={exporting} className="btn-ghost py-2 px-4 rounded-full text-sm">
                  {exporting ? 'Exporting…' : 'Export Excel'}
                </button>
                <Link href="/debts/new" className="inline-flex items-center gap-1.5 btn-primary py-2 px-4 rounded-full text-sm font-medium">
                  + Add debt
                </Link>
              </div>
            </div>
          </div>

          {alerts.length > 0 && (
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {alerts.map((debt) => (
                <Link
                  key={debt.id}
                  href={`/debts/${debt.id}`}
                  className={`rounded-2xl border px-4 py-3 ${alertTone(debt.urgency_status)}`}
                  title={debtTooltip(debt)}
                >
                  <p className="text-sm font-medium">{debt.lender_name}</p>
                  <p className="text-xs mt-1">{debt.urgency_message} · target {fmtDate(debt.target_date)}</p>
                </Link>
              ))}
            </section>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Active debts</p>
              <p className="text-lg font-medium mt-1">{summary.active_count}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Monthly interest</p>
              <p className="text-lg font-medium mt-1 text-danger">{inrShort(summary.total_monthly_interest)}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Total paid so far</p>
              <p className="text-lg font-medium mt-1 text-mint-600">{inrShort(summary.total_paid)}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Range outflow</p>
              <p className="text-lg font-medium mt-1 text-sky-600">{inrShort(dashboard.payment_range.total_outflow)}</p>
            </div>
          </div>

          <div className="grid xl:grid-cols-2 gap-4 md:gap-5">
            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">High to low debt details</h2>
                <span className="text-[11px] text-ink-mute">Outstanding total</span>
              </div>
              <div className="space-y-3">
                {byOutstanding.slice(0, 6).map((debt) => {
                  const pct = Math.max(6, Math.round((Number(debt.outstanding_total || 0) / maxOutstanding) * 100));
                  return (
                    <Link key={debt.id} href={`/debts/${debt.id}`} className="block group" title={debtTooltip(debt)}>
                      <div className="flex justify-between text-xs mb-1 gap-2">
                        <span className="text-ink-soft truncate">{debt.lender_name}</span>
                        <span className="font-medium">{inrShort(debt.outstanding_total)}</span>
                      </div>
                      <div className="h-2 bg-paper-tint rounded-full overflow-hidden">
                        <div className="fill-bar h-full bg-danger rounded-full group-hover:bg-ember-600 transition-colors" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-ink-mute mt-1">
                        <span>
                          {debt.category || 'Uncategorized'}
                          {debt.instrument_tag ? ` · ${instrumentTagLabel(debt.instrument_tag)}` : ''}
                          {debt.priority != null ? ` · P${debt.priority}` : ''}
                        </span>
                        <span>{inrShort(debt.current_monthly_interest)}/mo</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">Interest burden per month</h2>
                <span className="text-[11px] text-ink-mute">Hover rows for details</span>
              </div>
              <div className="space-y-3">
                {byInterest.slice(0, 6).map((debt) => {
                  const pct = Math.max(6, Math.round((Number(debt.current_monthly_interest || 0) / maxMonthlyInterest) * 100));
                  return (
                    <Link key={debt.id} href={`/debts/${debt.id}`} className="block" title={debtTooltip(debt)}>
                      <div className="flex items-center gap-3">
                        <div className="w-28 text-xs truncate">{debt.lender_name}</div>
                        <div className="flex-1 h-9 bg-paper-tint rounded-xl overflow-hidden relative">
                          <div className="absolute inset-y-0 left-0 bg-sky-600/85 rounded-xl" style={{ width: `${pct}%` }} />
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
            </section>

            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">Outstanding vs paid so far</h2>
                <span className="text-[11px] text-ink-mute">Top active debts</span>
              </div>
              <div className="space-y-4">
                {byOutstanding.slice(0, 5).map((debt) => {
                  const outstanding = Number(debt.outstanding_total || 0);
                  const paid = Number(debt.total_paid || 0);
                  const total = Math.max(outstanding + paid, 1);
                  const paidPct = Math.round((paid / total) * 100);
                  const outstandingPct = 100 - paidPct;
                  return (
                    <Link key={debt.id} href={`/debts/${debt.id}`} className="block" title={debtTooltip(debt)}>
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
            </section>

            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-sm font-medium">Priority queue</h2>
                <span className="text-[11px] text-ink-mute">Optional payoff priority</span>
              </div>
              <div className="space-y-3">
                {byPriority.slice(0, 6).map((debt, index) => (
                  <Link
                    key={debt.id}
                    href={`/debts/${debt.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-edge px-3 py-2.5"
                    title={debtTooltip(debt)}
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
            </section>
          </div>

          <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
            <div className="flex justify-between items-baseline mb-4 gap-3">
              <div>
                <h2 className="text-sm font-medium">Day-wise account outflow</h2>
                <p className="text-[11px] text-ink-mute mt-1">Filter by date above to see how much left your account.</p>
              </div>
              <span className="text-xs text-sky-600">{inr(dashboard.payment_range.total_outflow)} total</span>
            </div>

            {paymentDays.length === 0 ? (
              <p className="text-sm text-ink-mute text-center py-6">No payments found for the selected range.</p>
            ) : (
              <div className="space-y-3">
                {paymentDays.map((day) => (
                  <div key={day.payment_date} className="rounded-xl border border-edge p-3" title={day.items.map((item) => `${item.lender_name}: ${inr(item.amount)} (${item.payment_type})`).join('\n')}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium">{fmtDate(day.payment_date)}</p>
                        <p className="text-[11px] text-ink-mute mt-1">{day.payment_count} payment{day.payment_count === 1 ? '' : 's'}</p>
                      </div>
                      <p className="text-sm font-medium text-sky-600">{inr(day.total_amount)}</p>
                    </div>
                    <div className="mt-2 space-y-1">
                      {day.items.slice(0, 3).map((item, index) => (
                        <div key={`${day.payment_date}-${item.debt_id}-${index}`} className="flex justify-between text-[11px] text-ink-mute gap-3">
                          <span className="truncate">{item.lender_name} · {item.payment_type}</span>
                          <span>{inr(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
