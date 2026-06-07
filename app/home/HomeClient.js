'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { inr, inrShort, fmtDate, monthlyInterest, monthsElapsed, statusColor, statusLabel } from '@/lib/format';

export default function HomeClient({ user }) {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/debts')
      .then(r => r.json())
      .then(d => { setDebts(d.debts || []); setLoading(false); });
  }, []);

  const activeDebts = debts.filter(d => d.status === 'active');
  const clearedDebts = debts.filter(d => d.status === 'cleared');

  const totalPrincipal = activeDebts.reduce((s, d) => s + Number(d.current_principal), 0);
  const totalMonthlyInterest = activeDebts.reduce((s, d) => s + monthlyInterest(d.current_principal, d.interest_rate), 0);
  const totalPaid = debts.reduce((s, d) => s + Number(d.total_paid), 0);

  // Accumulated unpaid interest across all active debts
  const totalAccumulated = activeDebts.reduce((s, d) => {
    const months = monthsElapsed(d.start_date);
    const gross = monthlyInterest(d.current_principal, d.interest_rate) * months;
    const interestPaid = Number(d.total_interest_paid);
    return s + Math.max(0, gross - interestPaid);
  }, 0);

  const empty = !loading && debts.length === 0;

  // Bar chart data: top 6 active debts by current principal (largest first)
  const chartDebts = [...activeDebts]
    .sort((a, b) => Number(b.current_principal) - Number(a.current_principal))
    .slice(0, 6);
  const maxPrincipal = Math.max(...chartDebts.map(d => Number(d.current_principal)), 1);

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

      {!loading && !empty && (
        <div className="px-4 md:px-8 py-5 md:py-6 max-w-5xl mx-auto w-full">

          {/* Header */}
          <div className="md:flex md:items-end md:justify-between mb-5">
            <div>
              <p className="text-[11px] tracking-wider text-ink-mute uppercase">Total outstanding</p>
              <h1 className="text-3xl md:text-4xl font-medium tracking-tight mt-1">{inr(totalPrincipal)}</h1>
              <p className="text-sm mt-1.5 text-danger">
                + {inr(totalAccumulated)} unpaid interest
              </p>
            </div>
            <Link href="/debts/new" className="hidden md:inline-flex items-center gap-1.5 btn-primary py-2 px-4 rounded-full text-sm font-medium">
              + Add debt
            </Link>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-6">
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Active debts</p>
              <p className="text-lg font-medium mt-1">{activeDebts.length}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Monthly interest</p>
              <p className="text-lg font-medium mt-1 text-danger">{inrShort(totalMonthlyInterest)}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Total paid so far</p>
              <p className="text-lg font-medium mt-1 text-mint-600">{inrShort(totalPaid)}</p>
            </div>
            <div className="bg-paper-card border border-edge rounded-xl p-3.5">
              <p className="text-[11px] text-ink-mute">Cleared debts</p>
              <p className="text-lg font-medium mt-1">{clearedDebts.length}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-5">

            {/* Bar chart */}
            {chartDebts.length > 0 && (
              <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
                <h2 className="text-sm font-medium mb-4">Outstanding principals</h2>
                <div className="space-y-3">
                  {chartDebts.map(d => {
                    const pct = Math.round((Number(d.current_principal) / maxPrincipal) * 100);
                    return (
                      <Link key={d.id} href={`/debts/${d.id}`} className="block group">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-ink-soft truncate max-w-[120px]">{d.lender_name}</span>
                          <span className="font-medium">{inrShort(d.current_principal)}</span>
                        </div>
                        <div className="h-2 bg-paper-tint rounded-full overflow-hidden">
                          <div
                            className="fill-bar h-full bg-danger rounded-full group-hover:bg-ember-600 transition-colors"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Recent debts list */}
            <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
              <div className="flex justify-between items-baseline mb-3">
                <h2 className="text-sm font-medium">Active debts</h2>
                <Link href="/debts" className="text-xs text-sky-600">see all</Link>
              </div>
              {activeDebts.slice(0, 4).map(d => {
                const monthly = monthlyInterest(d.current_principal, d.interest_rate);
                return (
                  <Link key={d.id} href={`/debts/${d.id}`}
                    className="flex items-center justify-between py-2.5 border-b border-edge last:border-b-0 hover:bg-paper-tint/50 -mx-2 px-2 rounded transition">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{d.lender_name}</p>
                      <p className="text-[11px] text-ink-mute mt-0.5">
                        {d.interest_rate}% /mo · started {fmtDate(d.start_date)}
                      </p>
                    </div>
                    <div className="text-right ml-2 flex-shrink-0">
                      <p className="text-xs font-medium">{inrShort(d.current_principal)}</p>
                      <p className="text-[10px] text-danger mt-0.5">{inrShort(monthly)}/mo</p>
                    </div>
                  </Link>
                );
              })}
              {activeDebts.length === 0 && (
                <p className="text-sm text-ink-mute text-center py-4">No active debts 🎉</p>
              )}
            </section>

          </div>
        </div>
      )}
    </Shell>
  );
}
