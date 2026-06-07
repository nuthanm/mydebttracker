'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Shell from '@/components/Shell';
import { inr, inrShort, fmtDate, fmtMonthYear, statusColor, statusLabel } from '@/lib/format';
import { getAccruedMonthsCount } from '@/lib/debtInterest';

function instrumentTagLabel(value) {
  if (value === 'temp') return 'Temp';
  if (value === 'short_term') return 'Short term';
  if (value === 'long_term') return 'Long term';
  return value || '';
}

function alertTone(status) {
  return status === 'overdue'
    ? 'bg-danger/10 border-danger/20 text-danger'
    : 'bg-honey-50 border-honey-600/20 text-honey-600';
}

export default function DebtsClient({ user }) {
  const [debts, setDebts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [instrumentTags, setInstrumentTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | active | cleared
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');

  useEffect(() => {
    fetch('/api/debts')
      .then(r => r.json())
      .then((data) => {
        setDebts(data.debts || []);
        setCategories(data.categories || []);
        setInstrumentTags(data.instrument_tags || []);
        setLoading(false);
      });
  }, []);

  const alerts = useMemo(
    () => debts.filter((debt) => debt.status === 'active' && debt.urgency_status !== 'none'),
    [debts]
  );

  const filtered = debts
    .filter(d => filter === 'all' ? true : filter === 'active' ? d.status === 'active' : d.status === 'cleared')
    .filter(d => categoryFilter === 'all' ? true : d.category === categoryFilter)
    .filter(d => tagFilter === 'all' ? true : d.instrument_tag === tagFilter)
    .filter(d => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return [d.lender_name, d.notes, d.category, d.instrument_tag, instrumentTagLabel(d.instrument_tag)]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term));
    });

  return (
    <Shell user={user}>
      <div className="px-4 md:px-8 py-5 md:py-6 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div>
            <h1 className="text-xl font-medium">All debts</h1>
            <p className="text-xs text-ink-mute mt-1">Track category, payoff priority, and upcoming target alerts.</p>
          </div>
          <Link href="/debts/new" className="btn-primary py-1.5 px-3 rounded-lg text-xs font-medium whitespace-nowrap">
            + Add
          </Link>
        </div>

        {alerts.length > 0 && (
          <div className="mb-4 space-y-2">
            {alerts.slice(0, 3).map((debt) => (
              <Link
                key={debt.id}
                href={`/debts/${debt.id}`}
                className={`block rounded-2xl border px-4 py-3 ${alertTone(debt.urgency_status)}`}
                title={`${debt.lender_name} · ${debt.urgency_message} · Target ${fmtDate(debt.target_date)}`}
              >
                <p className="text-sm font-medium">{debt.lender_name}</p>
                <p className="text-xs mt-1">{debt.urgency_message} · target {fmtDate(debt.target_date)}</p>
              </Link>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-[1fr,180px,180px] gap-3 mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by lender, notes, or category"
            className="field-input"
          />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="field-input">
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="field-input">
            <option value="all">All tags</option>
            {instrumentTags.map((tag) => (
              <option key={tag} value={tag}>{instrumentTagLabel(tag)}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {['all', 'active', 'cleared'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`chip text-xs capitalize ${filter === f ? 'on' : ''}`}>
              {f}
            </button>
          ))}
        </div>

        {loading && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-20 bg-paper-tint rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-ink-mute text-sm mb-4">No debts found.</p>
            <Link href="/debts/new" className="btn-primary py-2 px-5 rounded-lg text-sm inline-block">
              Add a debt
            </Link>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map(d => {
              const unpaidInterest = Number(d.unpaid_interest || 0);
              const totalOwed = Number(d.outstanding_total || Number(d.current_principal || 0) + unpaidInterest);
              const interestMonths = getAccruedMonthsCount(d.interest_start_month, d.interest_to_month);
              const tooltip = [
                `Monthly interest: ${inr(d.current_monthly_interest || 0)}`,
                `Interest paid: ${inr(d.total_interest_paid || 0)}`,
                `Principal paid: ${inr(d.total_principal_paid || 0)}`,
                `Unpaid interest: ${inr(unpaidInterest)}`,
                `Total owed: ${inr(totalOwed)}`,
              ].join('\n');

              return (
                <Link key={d.id} href={`/debts/${d.id}`}
                  className="block bg-paper-card border border-edge rounded-2xl p-4 hover:border-ink-soft transition"
                  title={tooltip}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-medium text-sm truncate">{d.lender_name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(d.status)}`}>
                          {statusLabel(d.status)}
                        </span>
                        {d.category && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 font-medium">
                            {d.category}
                          </span>
                        )}
                        {d.instrument_tag && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                            {instrumentTagLabel(d.instrument_tag)}
                          </span>
                        )}
                        {d.priority != null && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-plum-50 text-plum-600 font-medium">
                            P{d.priority}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-mute">
                        {d.interest_rate}% /mo · since {fmtDate(d.start_date)}
                        {d.target_date ? ` · target ${fmtDate(d.target_date)}` : ''}
                      </p>
                      {d.urgency_status !== 'none' && (
                        <p className={`text-[11px] mt-1 font-medium ${d.urgency_status === 'overdue' ? 'text-danger' : 'text-honey-700'}`}>
                          {d.urgency_message}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium">{inrShort(totalOwed)}</p>
                      <p className="text-[11px] text-danger">{inrShort(d.current_monthly_interest)}/mo interest</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-edge flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-mute">
                    <span>Paid: <span className="text-mint-600 font-medium">{inr(d.total_paid)}</span></span>
                    <span>Interest paid: <span className="text-sky-600 font-medium">{inr(d.total_interest_paid)}</span></span>
                    <span>
                      Unpaid interest: <span className="text-danger font-medium">{inr(unpaidInterest)}</span>
                      {unpaidInterest > 0 && d.interest_start_month && d.interest_to_month && (
                        <span className="text-ink-mute">
                          {' '}({fmtMonthYear(d.interest_start_month)} – {fmtMonthYear(d.interest_to_month)} · {interestMonths} mo)
                        </span>
                      )}
                    </span>
                    <span className="ml-auto">Total owed: <span className="text-ink font-medium">{inr(totalOwed)}</span></span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
