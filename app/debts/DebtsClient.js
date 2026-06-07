'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { inr, inrShort, fmtDate, fmtMonthYear, statusColor, statusLabel } from '@/lib/format';
import { getAccruedMonthsCount } from '@/lib/debtInterest';

export default function DebtsClient({ user }) {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | active | cleared
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/debts')
      .then(r => r.json())
      .then(d => { setDebts(d.debts || []); setLoading(false); });
  }, []);

  const filtered = debts
    .filter(d => filter === 'all' ? true : filter === 'active' ? d.status === 'active' : d.status === 'cleared')
    .filter(d => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return d.lender_name?.toLowerCase().includes(term) || d.notes?.toLowerCase().includes(term);
    });

  return (
    <Shell user={user}>
      <div className="px-4 md:px-8 py-5 md:py-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-medium">All debts</h1>
          <Link href="/debts/new" className="btn-primary py-1.5 px-3 rounded-lg text-xs font-medium">
            + Add
          </Link>
        </div>

        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by lender or notes"
            className="field-input"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
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
              const totalOwed = Number(d.current_principal) + unpaidInterest;
              const interestMonths = getAccruedMonthsCount(d.interest_start_month, d.interest_to_month);

              return (
                <Link key={d.id} href={`/debts/${d.id}`}
                  className="block bg-paper-card border border-edge rounded-2xl p-4 hover:border-ink-soft transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{d.lender_name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(d.status)}`}>
                          {statusLabel(d.status)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-mute">
                        {d.interest_rate}% /mo · since {fmtDate(d.start_date)}
                        {d.target_date ? ` · target ${fmtDate(d.target_date)}` : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium">{inrShort(d.current_principal)}</p>
                      <p className="text-[11px] text-danger">{inrShort(d.current_monthly_interest)}/mo interest</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-edge flex gap-4 text-[11px] text-ink-mute">
                    <span>Paid: <span className="text-mint-600 font-medium">{inr(d.total_paid)}</span></span>
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
