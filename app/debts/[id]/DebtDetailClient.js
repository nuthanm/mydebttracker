'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { toast } from '@/components/Toast';
import { inr, inrShort, fmtDate, monthlyInterest, monthsElapsed, statusColor, statusLabel } from '@/lib/format';

const PAYMENT_TYPES = [
  { value: 'interest',   label: 'Interest payment' },
  { value: 'principal',  label: 'Principal repayment' },
  { value: 'clearance',  label: 'Full clearance' },
];

export default function DebtDetailClient({ user, debtId }) {
  const router = useRouter();
  const shareRef = useRef(null);

  const [debt, setDebt] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Payment form
  const [showForm, setShowForm] = useState(false);
  const [pForm, setPForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    payment_type: 'interest',
    amount: '',
    notes: '',
  });
  const [pSaving, setPSaving] = useState(false);
  const [pError, setPError] = useState('');

  const loadData = useCallback(async () => {
    const [dr, pr] = await Promise.all([
      fetch(`/api/debts/${debtId}`).then(r => r.json()),
      fetch(`/api/debts/${debtId}/payments`).then(r => r.json()),
    ]);
    if (dr.debt) setDebt(dr.debt);
    if (pr.payments) setPayments(pr.payments);
    setLoading(false);
  }, [debtId]);

  useEffect(() => { loadData(); }, [loadData]);

  const setP = (k, v) => setPForm(f => ({ ...f, [k]: v }));

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    setPError('');
    setPSaving(true);
    try {
      const res = await fetch(`/api/debts/${debtId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not record payment.');
      toast('Payment recorded!');
      setShowForm(false);
      setPForm({ payment_date: new Date().toISOString().slice(0, 10), payment_type: 'interest', amount: '', notes: '' });
      loadData();
    } catch (err) {
      setPError(err.message);
    } finally {
      setPSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!confirm('Delete this payment record?')) return;
    try {
      const res = await fetch(`/api/debts/${debtId}/payments/${paymentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete payment.');
      toast('Payment deleted.', 'info');
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleMarkCleared = async () => {
    if (!confirm('Mark this debt as fully cleared?')) return;
    const res = await fetch(`/api/debts/${debtId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cleared' }),
    });
    if (res.ok) { toast('Debt cleared! 🎉'); loadData(); }
    else toast('Could not update.', 'error');
  };

  const handleDeleteDebt = async () => {
    if (!confirm('Delete this debt permanently? All payment records will also be deleted.')) return;
    const res = await fetch(`/api/debts/${debtId}`, { method: 'DELETE' });
    if (res.ok) { toast('Debt deleted.', 'info'); router.push('/debts'); }
    else toast('Could not delete.', 'error');
  };

  // Share as image using Canvas API
  const handleShare = async () => {
    if (!debt) return;
    const canvas = document.createElement('canvas');
    const W = 640, H = 480;
    canvas.width = W * 2;
    canvas.height = H * 2;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#FAF8F2';
    ctx.fillRect(0, 0, W, H);

    // Header bar
    ctx.fillStyle = '#0E1714';
    ctx.fillRect(0, 0, W, 56);

    // Title
    ctx.fillStyle = '#FAF8F2';
    ctx.font = 'bold 18px system-ui';
    ctx.fillText('My Debt Tracker', 20, 34);

    ctx.fillStyle = '#FAF8F2';
    ctx.font = '13px system-ui';
    ctx.fillText(user.name, W - 20 - ctx.measureText(user.name).width, 34);

    // Debt name
    ctx.fillStyle = '#0E1714';
    ctx.font = 'bold 22px system-ui';
    ctx.fillText(debt.lender_name, 20, 90);

    // Status
    const statusText = statusLabel(debt.status);
    ctx.font = '12px system-ui';
    ctx.fillStyle = debt.status === 'cleared' ? '#0F6E56' : '#854F0B';
    ctx.fillText(statusText, 20, 112);

    // Stats
    const months = monthsElapsed(debt.start_date);
    const monthly = monthlyInterest(debt.current_principal, debt.interest_rate);
    const grossInterest = monthly * months;
    const unpaid = Math.max(0, grossInterest - Number(debt.total_interest_paid || 0));
    const totalOwed = Number(debt.current_principal) + unpaid;

    const stats = [
      { label: 'Original Principal', value: inr(debt.principal) },
      { label: 'Current Principal', value: inr(debt.current_principal) },
      { label: 'Monthly Interest', value: inr(monthly) + ' @ ' + debt.interest_rate + '% /mo' },
      { label: 'Total Paid', value: inr(debt.total_paid || 0) },
      { label: 'Unpaid Interest', value: inr(unpaid) },
      { label: 'Total Owed', value: inr(totalOwed) },
    ];

    ctx.font = '13px system-ui';
    stats.forEach((s, i) => {
      const x = i % 2 === 0 ? 20 : W / 2 + 10;
      const y = 145 + Math.floor(i / 2) * 52;
      ctx.fillStyle = '#7A867F';
      ctx.fillText(s.label, x, y);
      ctx.fillStyle = '#0E1714';
      ctx.font = 'bold 15px system-ui';
      ctx.fillText(s.value, x, y + 20);
      ctx.font = '13px system-ui';
    });

    // Bar chart (principal vs paid)
    const chartY = 335;
    const chartH = 80;
    const barW = 200;
    const maxVal = Math.max(Number(debt.principal), 1);

    const bars = [
      { label: 'Principal', val: Number(debt.current_principal), color: '#A32D2D' },
      { label: 'Total Paid', val: Number(debt.total_paid || 0), color: '#0F6E56' },
    ];

    ctx.font = '12px system-ui';
    bars.forEach((b, i) => {
      const x = 20 + i * (barW + 30);
      const fillH = Math.max(4, (b.val / maxVal) * chartH);
      const y = chartY + chartH - fillH;
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y, barW, fillH);
      ctx.fillStyle = '#3A4742';
      ctx.font = '11px system-ui';
      ctx.fillText(b.label, x, chartY + chartH + 16);
      ctx.fillStyle = '#0E1714';
      ctx.font = 'bold 12px system-ui';
      ctx.fillText(inrShort(b.val), x, y - 6);
    });

    // Footer
    ctx.fillStyle = '#A8B0AB';
    ctx.font = '11px system-ui';
    const dateStr = 'Generated on ' + new Date().toLocaleDateString('en-IN');
    ctx.fillText(dateStr, W - 20 - ctx.measureText(dateStr).width, H - 12);

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) { toast('Could not generate image.', 'error'); return; }
        const file = new File([blob], 'debt-summary.png', { type: 'image/png' });
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Debt: ${debt.lender_name}` });
        } else {
          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `debt-${debt.lender_name.replace(/\s+/g, '-')}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast('Image downloaded!');
        }
      }, 'image/png');
    } catch (err) {
      toast('Share cancelled.', 'info');
    }
  };

  if (loading) {
    return (
      <Shell user={user}>
        <div className="p-5 space-y-3">
          <div className="h-6 w-40 bg-paper-tint rounded animate-pulse" />
          <div className="h-32 bg-paper-tint rounded-2xl animate-pulse" />
        </div>
      </Shell>
    );
  }

  if (!debt) {
    return (
      <Shell user={user}>
        <div className="p-5 text-center text-ink-mute">Debt not found.</div>
      </Shell>
    );
  }

  const months = monthsElapsed(debt.start_date);
  const monthly = monthlyInterest(debt.current_principal, debt.interest_rate);
  const grossInterest = monthly * months;
  const unpaidInterest = Math.max(0, grossInterest - Number(debt.total_interest_paid || 0));
  const totalOwed = Number(debt.current_principal) + unpaidInterest;

  // Bar chart data for monthly breakdown (last 6 months)
  const barMaxVal = Math.max(Number(debt.principal), Number(debt.total_paid || 0), 1);

  return (
    <Shell user={user}>
      <div className="px-4 md:px-8 py-5 md:py-6 max-w-3xl mx-auto w-full space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-medium">{debt.lender_name}</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(debt.status)}`}>
                {statusLabel(debt.status)}
              </span>
            </div>
            <p className="text-xs text-ink-mute mt-1">
              Since {fmtDate(debt.start_date)}
              {debt.target_date ? ` · Target: ${fmtDate(debt.target_date)}` : ''}
              {debt.notes ? ` · ${debt.notes}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleShare}
              className="w-9 h-9 rounded-xl border border-edge flex items-center justify-center text-ink-soft hover:bg-paper-tint transition"
              title="Share as image">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            </button>
            <button onClick={handleDeleteDebt}
              className="w-9 h-9 rounded-xl border border-edge flex items-center justify-center text-danger hover:bg-danger/10 transition"
              title="Delete debt">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Original principal</p>
            <p className="text-base font-medium mt-1">{inr(debt.principal)}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Current principal</p>
            <p className="text-base font-medium mt-1">{inr(debt.current_principal)}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Monthly interest</p>
            <p className="text-base font-medium mt-1 text-danger">{inr(monthly)}</p>
            <p className="text-[10px] text-ink-mute">{debt.interest_rate}% /month</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Total paid so far</p>
            <p className="text-base font-medium mt-1 text-mint-600">{inr(debt.total_paid || 0)}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Unpaid interest</p>
            <p className="text-base font-medium mt-1 text-danger">{inr(unpaidInterest)}</p>
            <p className="text-[10px] text-ink-mute">over {months} months</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5 bg-danger/5 border-danger/20">
            <p className="text-[11px] text-danger">Total owed now</p>
            <p className="text-base font-medium mt-1 text-danger">{inr(totalOwed)}</p>
          </div>
        </div>

        {/* Bar chart visual */}
        <div className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
          <h2 className="text-sm font-medium mb-4">Overview</h2>
          <div className="flex items-end gap-4 h-28">
            {[
              { label: 'Principal', val: Number(debt.current_principal), color: 'bg-danger' },
              { label: 'Interest paid', val: Number(debt.total_interest_paid || 0), color: 'bg-sky-600' },
              { label: 'Principal paid', val: Number(debt.total_principal_paid || 0), color: 'bg-mint-600' },
              { label: 'Unpaid interest', val: unpaidInterest, color: 'bg-honey-600' },
            ].map(b => {
              const pct = Math.round((b.val / barMaxVal) * 100);
              return (
                <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-medium text-ink-soft">{inrShort(b.val)}</span>
                  <div className="w-full bg-paper-tint rounded-t-md overflow-hidden" style={{ height: '80px' }}>
                    <div
                      className={`fill-bar w-full ${b.color} rounded-t-md transition-all`}
                      style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-ink-mute text-center leading-tight">{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowForm(v => !v)}
            className="btn-primary py-2 px-4 rounded-lg text-sm font-medium">
            {showForm ? 'Cancel' : '+ Record payment'}
          </button>
          {debt.status === 'active' && (
            <button onClick={handleMarkCleared}
              className="btn-ghost py-2 px-4 rounded-lg text-sm">
              Mark as cleared ✓
            </button>
          )}
        </div>

        {/* Payment form */}
        {showForm && (
          <form onSubmit={handlePaymentSubmit}
            className="bg-paper-card border border-edge rounded-2xl p-4 space-y-4 anim-fade">
            <h3 className="text-sm font-medium">Record payment</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-soft mb-1.5">Date<span className="text-danger ml-0.5">*</span></label>
                <input type="date" value={pForm.payment_date}
                  onChange={e => setP('payment_date', e.target.value)} required className="field-input" />
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-1.5">Amount (₹)<span className="text-danger ml-0.5">*</span></label>
                <input type="number" inputMode="numeric" min="1" step="1"
                  placeholder={inr(monthly).replace('₹', '')}
                  value={pForm.amount}
                  onChange={e => setP('amount', e.target.value)} required className="field-input" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-ink-soft mb-1.5">Payment type<span className="text-danger ml-0.5">*</span></label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_TYPES.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => setP('payment_type', t.value)}
                    className={`chip text-xs ${pForm.payment_type === t.value ? 'on' : ''}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {pForm.payment_type === 'principal' && (
                <p className="text-[11px] text-ink-mute mt-1.5">This reduces the outstanding principal; future interest is calculated on the new lower amount.</p>
              )}
              {pForm.payment_type === 'clearance' && (
                <p className="text-[11px] text-mint-600 mt-1.5">Full clearance will mark this debt as settled.</p>
              )}
            </div>

            <div>
              <label className="block text-xs text-ink-soft mb-1.5">Notes <span className="text-ink-mute">(optional)</span></label>
              <input type="text" placeholder="e.g. July interest payment"
                value={pForm.notes} onChange={e => setP('notes', e.target.value)} className="field-input" />
            </div>

            {pError && <p className="text-xs text-danger">{pError}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="btn-ghost flex-1 py-2 rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={pSaving}
                className="btn-primary flex-1 py-2 rounded-lg text-sm font-medium">
                {pSaving ? 'Saving…' : 'Record'}
              </button>
            </div>
          </form>
        )}

        {/* Payment history */}
        <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
          <h2 className="text-sm font-medium mb-3">Payment history</h2>

          {payments.length === 0 ? (
            <p className="text-sm text-ink-mute text-center py-6">No payments recorded yet.</p>
          ) : (
            <div className="divide-y divide-edge">
              {payments.map(p => {
                const typeColors = {
                  interest:  'bg-sky-50 text-sky-600',
                  principal: 'bg-mint-50 text-mint-600',
                  clearance: 'bg-plum-50 text-plum-600',
                };
                const typeLabels = {
                  interest:  'Interest',
                  principal: 'Principal',
                  clearance: 'Clearance',
                };
                return (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${typeColors[p.payment_type] || 'bg-paper-tint text-ink-mute'}`}>
                        {typeLabels[p.payment_type] || p.payment_type}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{fmtDate(p.payment_date)}</p>
                        {p.notes && <p className="text-[11px] text-ink-mute truncate">{p.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-medium">{inr(p.amount)}</span>
                      <button
                        onClick={() => handleDeletePayment(p.id)}
                        className="w-6 h-6 rounded flex items-center justify-center text-ink-mute hover:text-danger hover:bg-danger/10 transition"
                        title="Delete payment">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Summary share card (text) */}
        <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5" ref={shareRef}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Shareable summary</h2>
            <button onClick={handleShare}
              className="btn-ghost text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Share image
            </button>
          </div>
          <div className="font-mono text-xs bg-paper-tint rounded-xl p-3 whitespace-pre-wrap text-ink-soft select-all">
{`📋 Debt Summary — ${debt.lender_name}
━━━━━━━━━━━━━━━━━━━━━━━
👤 Lender      : ${debt.lender_name}
📅 Since       : ${fmtDate(debt.start_date)}${debt.target_date ? '\n🎯 Target      : ' + fmtDate(debt.target_date) : ''}
💰 Principal   : ${inr(debt.principal)}
📉 Current bal : ${inr(debt.current_principal)}
📈 Interest    : ${debt.interest_rate}% /month (${inr(monthly)}/mo)
✅ Total paid  : ${inr(debt.total_paid || 0)}
⚠️  Unpaid int  : ${inr(unpaidInterest)} (${months} months)
🏦 Total owed  : ${inr(totalOwed)}
📊 Status      : ${statusLabel(debt.status)}
━━━━━━━━━━━━━━━━━━━━━━━
via My Debt Tracker`}
          </div>
        </section>

      </div>
    </Shell>
  );
}
