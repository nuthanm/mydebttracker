'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { toast } from '@/components/Toast';
import { appConfirm } from '@/components/ConfirmDialog';
import { exportDebtWorkbook } from '@/lib/export';
import { buildSnapshotFilename, copyOrDownloadElementImage, shareOrDownloadElementImage, TILE_SNAPSHOT_BG } from '@/lib/clipboardImage';
import { inr, inrShort, inrRaw, fmtDate, fmtMonthYear, statusColor, statusLabel } from '@/lib/format';
import { getAccruedMonthsCount, sumInterestForMonthRange, calculateEmiSchedule, getMonthsToCloseWithEmi } from '@/lib/debtInterest';

const PAYMENT_TYPES = [
  { value: 'interest',   label: 'Interest payment' },
  { value: 'principal',  label: 'Principal repayment' },
  { value: 'clearance',  label: 'Full clearance' },
  { value: 'topup',      label: 'Borrowed more' },
];
const INSTRUMENT_TAG_OPTIONS = [
  { value: '', label: 'Select tag' },
  { value: 'temp', label: 'Temp' },
  { value: 'short_term', label: 'Short term' },
  { value: 'long_term', label: 'Long term' },
];

function instrumentTagLabel(value) {
  if (value === 'temp') return 'Temp';
  if (value === 'short_term') return 'Short term';
  if (value === 'long_term') return 'Long term';
  return value || '';
}

/** Returns the number of whole months covered by a YYYY-MM range (inclusive). */
function monthsInRange(fromYM, toYM) {
  if (!fromYM || !toYM) return 0;
  const [fy, fm] = fromYM.split('-').map(Number);
  const [ty, tm] = toYM.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

export default function DebtDetailClient({ user, debtId }) {
  const router = useRouter();
  const shareRef = useRef(null);
  const [currentMonth] = useState(() => new Date().toISOString().slice(0, 7));

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

  // Month-range interest payment
  const [multiMonth, setMultiMonth] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  // Edit debt form
  const [showEdit, setShowEdit] = useState(false);
  const [eForm, setEForm] = useState({
    lender_name: '',
    principal: '',
    interest_rate: '',
    rate_effective_month: currentMonth,
    category: '',
    instrument_tag: '',
    priority: '',
    target_date: '',
    notes: '',
    emi_amount: '',
  });
  const [eSaving, setESaving] = useState(false);
  const [eError, setEError] = useState('');

  // EMI amortization toggle
  const [showEmiSchedule, setShowEmiSchedule] = useState(false);

  const loadData = useCallback(async () => {
    const [dr, pr] = await Promise.all([
      fetch(`/api/debts/${debtId}`).then(r => r.json()),
      fetch(`/api/debts/${debtId}/payments`).then(r => r.json()),
    ]);
    if (dr.debt) {
      setDebt(dr.debt);
      setEForm({
        lender_name: dr.debt.lender_name || '',
        principal: dr.debt.principal || '',
        interest_rate: dr.debt.interest_rate || '',
        rate_effective_month: currentMonth,
        category: dr.debt.category || '',
        instrument_tag: dr.debt.instrument_tag || '',
        priority: dr.debt.priority ?? '',
        target_date: dr.debt.target_date ? dr.debt.target_date.slice(0, 10) : '',
        notes: dr.debt.notes || '',
        emi_amount: dr.debt.emi_amount != null ? String(dr.debt.emi_amount) : '',
      });
    }
    if (pr.payments) setPayments(pr.payments);
    setLoading(false);
  }, [currentMonth, debtId]);

  useEffect(() => { loadData(); }, [loadData]);

  const setP = (k, v) => setPForm(f => ({ ...f, [k]: v }));
  const setE = (k, v) => setEForm(f => ({ ...f, [k]: v }));

  // When month range changes, auto-fill amount
  useEffect(() => {
    if (!multiMonth || !rangeFrom || !rangeTo || !debt) return;
    const amount = sumInterestForMonthRange(debt.interest_months || [], rangeFrom, rangeTo);
    if (amount <= 0) return;
    setPForm(f => ({ ...f, amount: String(Math.round(amount)) }));
  }, [multiMonth, rangeFrom, rangeTo, debt]);

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    setPError('');
    setPSaving(true);
    try {
      let submitForm = { ...pForm };

      if (multiMonth && pForm.payment_type === 'interest') {
        if (!rangeFrom || !rangeTo) throw new Error('Please select both from and to months.');
        if (monthsInRange(rangeFrom, rangeTo) <= 0) throw new Error('"To" month must be on or after "From" month.');
        const [ty, tm] = rangeTo.split('-').map(Number);
        const fromLabel = fmtMonthYear(new Date(rangeFrom.split('-')[0], rangeFrom.split('-')[1] - 1, 1));
        const toLabel   = fmtMonthYear(new Date(ty, tm - 1, 1));
        submitForm = {
          ...submitForm,
          payment_date: `${ty}-${String(tm).padStart(2, '0')}-01`,
          notes: submitForm.notes || `Interest for ${fromLabel} – ${toLabel}`,
        };
      }

      const res = await fetch(`/api/debts/${debtId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not record transaction.');
      toast('Transaction recorded!');
      setShowForm(false);
      setMultiMonth(false);
      setRangeFrom('');
      setRangeTo('');
      setPForm({ payment_date: new Date().toISOString().slice(0, 10), payment_type: 'interest', amount: '', notes: '' });
      loadData();
    } catch (err) {
      setPError(err.message);
    } finally {
      setPSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!await appConfirm('Delete this payment record?')) return;
    try {
      const res = await fetch(`/api/debts/${debtId}/payments/${paymentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete payment.');
      toast('Record deleted.', 'info');
      loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleMarkCleared = async () => {
    if (!await appConfirm('Mark this debt as fully cleared?')) return;
    const res = await fetch(`/api/debts/${debtId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cleared' }),
    });
    if (res.ok) { toast('Debt cleared! 🎉'); loadData(); }
    else toast('Could not update.', 'error');
  };

  const handleDeleteDebt = async () => {
    if (!await appConfirm('Delete this debt permanently? All payment records will also be deleted.')) return;
    const res = await fetch(`/api/debts/${debtId}`, { method: 'DELETE' });
    if (res.ok) { toast('Debt deleted.', 'info'); router.push('/debts'); }
    else toast('Could not delete.', 'error');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEError('');
    setESaving(true);
    try {
      const res = await fetch(`/api/debts/${debtId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lender_name: eForm.lender_name,
          principal: eForm.principal,
          interest_rate: eForm.interest_rate,
          rate_effective_month: eForm.rate_effective_month,
          category: eForm.category || null,
          instrument_tag: eForm.instrument_tag || null,
          priority: eForm.priority || null,
          target_date: eForm.target_date || null,
          notes: eForm.notes || null,
          emi_amount: eForm.emi_amount || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update debt.');
      toast('Debt updated!');
      setShowEdit(false);
      loadData();
    } catch (err) {
      setEError(err.message);
    } finally {
      setESaving(false);
    }
  };

  const handleCopyShareImage = async () => {
    if (!debt || !shareRef.current) {
      toast('No summary section to copy.', 'error');
      return;
    }

    try {
      const result = await copyOrDownloadElementImage(
        shareRef.current,
        buildSnapshotFilename(debt.lender_name, 'summary'),
        { padding: 16, backgroundColor: TILE_SNAPSHOT_BG }
      );
      if (result === 'copied') toast('Summary section copied as image. Paste anywhere.');
      else toast('Clipboard unavailable. Summary image downloaded.', 'info');
    } catch (err) {
      toast('Could not copy summary image.', 'error');
    }
  };

  const handleShare = async () => {
    if (!debt || !shareRef.current) {
      toast('No summary section to share.', 'error');
      return;
    }

    try {
      const result = await shareOrDownloadElementImage(
        shareRef.current,
        buildSnapshotFilename(debt.lender_name, 'summary'),
        {
          padding: 16,
          backgroundColor: TILE_SNAPSHOT_BG,
          shareTitle: `Debt: ${debt.lender_name}`,
        }
      );
      if (result === 'shared') toast('Summary image ready to share.');
      else toast('Share unavailable. Summary image downloaded.', 'info');
    } catch (err) {
      if (err?.name === 'AbortError') toast('Share cancelled.', 'info');
      else {
        console.error('Could not share summary image:', err);
        toast('Could not share summary image.', 'error');
      }
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

  const months = getAccruedMonthsCount(debt.interest_start_month, debt.interest_to_month);
  const monthly = Number(debt.current_monthly_interest || 0);
  const unpaidInterest = Number(debt.unpaid_interest || 0);
  const principalPaid = Number(debt.total_principal_paid || 0);
  const interestPaid = Number(debt.total_interest_paid || 0);
  const totalTopupAmount = Number(debt.total_topup_amount || 0);
  const totalPaid = Number(debt.total_paid || 0);
  const totalOwed = Number(debt.current_principal) + unpaidInterest;
  const payableThisMonth = totalOwed + monthly;

  // EMI calculations
  const emiAmount = debt.emi_amount != null ? Number(debt.emi_amount) : null;
  const currentPrincipal = Number(debt.current_principal || 0);
  const emiInterestPortion = emiAmount != null ? Math.min(monthly, emiAmount) : null;
  const emiPrincipalPortion = emiAmount != null ? emiAmount - monthly : null;
  const emiMonthsToClose = emiAmount != null && emiPrincipalPortion > 0
    ? getMonthsToCloseWithEmi({ principal: currentPrincipal, interestRate: Number(debt.interest_rate), emiAmount })
    : null;
  const emiSchedule = emiAmount != null
    ? calculateEmiSchedule({ principal: currentPrincipal, interestRate: Number(debt.interest_rate), emiAmount, maxMonths: 120 })
    : [];
  const detailTooltip = [
    `Monthly interest: ${inr(monthly)}`,
    `Interest paid: ${inr(interestPaid)}`,
    `Principal paid: ${inr(principalPaid)}`,
    `Borrowed later: ${inr(totalTopupAmount)}`,
    `Unpaid interest: ${inr(unpaidInterest)}`,
    `Total owed (excluding current month interest): ${inr(totalOwed)}`,
    `Payable with current month interest: ${inr(payableThisMonth)}`,
  ].join('\n');
  const shareSummaryText = `📋 Debt Summary
━━━━━━━━━━━━━━━━━━━━━━━
👤 Lender      : ${debt.lender_name}
📅 Since       : ${fmtDate(debt.start_date)}${debt.target_date ? '\n🎯 Target      : ' + fmtDate(debt.target_date) : ''}
💰 Borrowed    : ${inr(debt.principal)}
➕ Borrowed later: ${inr(totalTopupAmount)}
📉 Current bal : ${inr(debt.current_principal)}
📈 Interest    : ${debt.interest_rate}% /month (${inr(monthly)}/mo)${emiAmount != null ? '\n📐 EMI         : ' + inr(emiAmount) + (emiMonthsToClose != null ? ' · clears in ' + emiMonthsToClose + ' month' + (emiMonthsToClose !== 1 ? 's' : '') : '') : ''}
✅ Paid total  : ${inr(totalPaid)}
🏦 Principal pd: ${inr(principalPaid)}
💠 Interest pd : ${inr(interestPaid)}
⚠️  Unpaid int  : ${inr(unpaidInterest)}${debt.interest_start_month && debt.interest_to_month ? ` (${fmtMonthYear(debt.interest_start_month)} – ${fmtMonthYear(debt.interest_to_month)}, ${months} mo)` : ''}
🏦 Total owed  : ${inr(totalOwed)}
📊 Status      : ${statusLabel(debt.status)}
━━━━━━━━━━━━━━━━━━━━━━━
via My Debt Tracker`;

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
              {debt.category && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-sky-50 text-sky-600">
                  {debt.category}
                </span>
              )}
              {debt.instrument_tag && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
                  {instrumentTagLabel(debt.instrument_tag)}
                </span>
              )}
              {debt.priority != null && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-plum-50 text-plum-600">
                  P{debt.priority}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-mute mt-1">
              Since {fmtDate(debt.start_date)}
              {debt.target_date ? ` · Target: ${fmtDate(debt.target_date)}` : ''}
              {debt.notes ? ` · ${debt.notes}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {/* Edit button */}
            <button onClick={() => setShowEdit(v => !v)}
              className="w-9 h-9 rounded-xl border border-edge flex items-center justify-center text-ink-soft hover:bg-paper-tint transition"
              title="Edit debt">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button onClick={handleShare}
              className="w-9 h-9 rounded-xl border border-edge flex items-center justify-center text-ink-soft hover:bg-paper-tint transition"
              title="Share as image">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            </button>
            <button onClick={handleCopyShareImage}
              className="w-9 h-9 rounded-xl border border-edge flex items-center justify-center text-ink-soft hover:bg-paper-tint transition"
              title="Copy summary as image">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              onClick={() => {
                try {
                  exportDebtWorkbook({ debt, payments });
                  toast('Debt export ready.');
                } catch (err) {
                  toast('Could not export debt.', 'error');
                }
              }}
              className="w-9 h-9 rounded-xl border border-edge flex items-center justify-center text-ink-soft hover:bg-paper-tint transition"
              title="Export Excel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" />
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

        {debt.urgency_status !== 'none' && (
          <div className={`rounded-2xl border px-4 py-3 ${debt.urgency_status === 'overdue' ? 'bg-danger/10 border-danger/20 text-danger' : 'bg-honey-50 border-honey-600/20 text-honey-600'}`}>
            <p className="text-sm font-medium">{debt.urgency_message}</p>
            <p className="text-xs mt-1">Target date: {fmtDate(debt.target_date)}. Update the target or clear the debt to remove this alert.</p>
          </div>
        )}

        {/* Edit debt form */}
        {showEdit && (
          <form onSubmit={handleEditSubmit}
            className="bg-paper-card border border-edge rounded-2xl p-4 space-y-4 anim-fade">
            <h3 className="text-sm font-medium">Edit debt details</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-ink-soft mb-1.5">Lender name<span className="text-danger ml-0.5">*</span></label>
                <input type="text" value={eForm.lender_name}
                  onChange={e => setE('lender_name', e.target.value)} required className="field-input" />
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-1.5">Principal amount<span className="text-danger ml-0.5">*</span></label>
                <input type="number" inputMode="decimal" min="0.01" step="0.01"
                  value={eForm.principal}
                  onChange={e => setE('principal', e.target.value)} required className="field-input" />
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-1.5">Monthly interest rate (%)<span className="text-danger ml-0.5">*</span></label>
                <input type="number" inputMode="decimal" min="0" step="0.01"
                  value={eForm.interest_rate}
                  onChange={e => setE('interest_rate', e.target.value)} required className="field-input" />
                <p className="text-[10px] text-ink-mute mt-1">New rate will be applied from the selected month onward. Older pending interest stays unchanged.</p>
              </div>
              <div>
                <label className="block text-xs text-ink-soft mb-1.5">New rate effective from</label>
                <input
                  type="month"
                  value={eForm.rate_effective_month}
                  max={currentMonth}
                  onChange={e => setE('rate_effective_month', e.target.value)}
                  className="field-input"
                />
              </div>
              <div>
               <label className="block text-xs text-ink-soft mb-1.5">Category <span className="text-ink-mute">(optional)</span></label>
               <input type="text" value={eForm.category}
                 onChange={e => setE('category', e.target.value)} className="field-input" />
              </div>
              <div>
               <label className="block text-xs text-ink-soft mb-1.5">Debt tag <span className="text-ink-mute">(optional)</span></label>
               <select value={eForm.instrument_tag}
                 onChange={e => setE('instrument_tag', e.target.value)} className="field-input">
                 {INSTRUMENT_TAG_OPTIONS.map((option) => (
                   <option key={option.value || 'blank'} value={option.value}>{option.label}</option>
                 ))}
               </select>
              </div>
              <div>
               <label className="block text-xs text-ink-soft mb-1.5">Priority <span className="text-ink-mute">(optional)</span></label>
               <input type="number" inputMode="numeric" min="1" max="10" step="1" value={eForm.priority}
                 onChange={e => setE('priority', e.target.value)} className="field-input" />
              </div>
              <div>
               <label className="block text-xs text-ink-soft mb-1.5">Target date <span className="text-ink-mute">(optional)</span></label>
               <input type="date" value={eForm.target_date}
                 onChange={e => setE('target_date', e.target.value)} className="field-input" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-ink-soft mb-1.5">Notes <span className="text-ink-mute">(optional)</span></label>
                <input type="text" value={eForm.notes}
                  onChange={e => setE('notes', e.target.value)} className="field-input" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-ink-soft mb-1.5">Monthly EMI <span className="text-ink-mute">(optional — for loans)</span></label>
                <input type="number" inputMode="numeric" min="1" step="1"
                  placeholder="e.g. 5000"
                  value={eForm.emi_amount}
                  onChange={e => setE('emi_amount', e.target.value)} className="field-input" />
                <p className="text-[10px] text-ink-mute mt-1">Set a fixed monthly EMI to track how your outstanding reduces each month.</p>
              </div>
            </div>

            {eError && <p className="text-xs text-danger">{eError}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowEdit(false)}
                className="btn-ghost flex-1 py-2 rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={eSaving}
                className="btn-primary flex-1 py-2 rounded-lg text-sm font-medium">
                {eSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Total borrowed</p>
            <p className="text-base font-medium mt-1">{inr(debt.principal)}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Current principal</p>
            <p className="text-base font-medium mt-1">{inr(debt.current_principal)}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Borrowed later</p>
            <p className="text-base font-medium mt-1 text-plum-600">{inr(totalTopupAmount)}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Monthly interest</p>
            <p className="text-base font-medium mt-1 text-danger">{inr(monthly)}</p>
            <p className="text-[10px] text-ink-mute">{debt.interest_rate}% /month</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Principal paid since borrowing</p>
            <p className="text-base font-medium mt-1 text-mint-600">{inr(principalPaid)}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Interest paid since borrowing</p>
            <p className="text-base font-medium mt-1 text-sky-600">{inr(interestPaid)}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Category</p>
            <p className="text-base font-medium mt-1">{debt.category || '—'}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Debt tag</p>
            <p className="text-base font-medium mt-1">{instrumentTagLabel(debt.instrument_tag) || '—'}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Priority</p>
            <p className="text-base font-medium mt-1">{debt.priority != null ? `P${debt.priority}` : '—'}</p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5">
            <p className="text-[11px] text-ink-mute">Unpaid interest</p>
            <p className="text-base font-medium mt-1 text-danger">{inr(unpaidInterest)}</p>
            <p className="text-[10px] text-ink-mute">
              {debt.interest_start_month && debt.interest_to_month
                ? `${fmtMonthYear(debt.interest_start_month)} – ${fmtMonthYear(debt.interest_to_month)} (${months} mo)`
                : debt.interest_start_month
                  ? `Starts from ${fmtMonthYear(debt.interest_start_month)}`
                  : 'No accrued interest yet'}
            </p>
          </div>
          <div className="bg-paper-card border border-edge rounded-xl p-3.5 bg-danger/5 border-danger/20">
            <p className="text-[11px] text-danger">Payable this month</p>
            <p className="text-base font-medium mt-1 text-danger">{inr(payableThisMonth)}</p>
            <p className="text-[10px] text-ink-mute">
              {inr(totalOwed)} pending + {inr(monthly)} current month interest
            </p>
          </div>
        </div>

        {debt.interest_periods?.length > 0 && (
          <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
            <h2 className="text-sm font-medium mb-3">Interest timeline</h2>
            <div className="space-y-3">
              {debt.interest_periods.map((period, index) => (
                <div key={`${period.from_month}-${period.to_month}-${index}`} className="rounded-xl border border-edge p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium">
                        {fmtMonthYear(period.from_month)}
                        {period.from_month !== period.to_month ? ` – ${fmtMonthYear(period.to_month)}` : ''}
                      </p>
                      <p className="text-[11px] text-ink-mute mt-1">
                        {period.months} mo · {inr(period.principal)} @ {period.interest_rate}% /mo
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-ink-mute">Pending</p>
                      <p className="text-sm font-medium text-danger">{inr(period.unpaid_interest)}</p>
                    </div>
                  </div>
                  {period.paid_interest > 0 && (
                    <p className="text-[11px] text-mint-600 mt-2">Interest paid already: {inr(period.paid_interest)}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* EMI plan section */}
        {emiAmount != null && (
          <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
            <h2 className="text-sm font-medium mb-3">EMI plan</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl border border-edge p-3">
                <p className="text-[11px] text-ink-mute">Monthly EMI</p>
                <p className="text-base font-medium mt-1">{inr(emiAmount)}</p>
              </div>
              <div className="rounded-xl border border-edge p-3">
                <p className="text-[11px] text-ink-mute">Interest portion</p>
                <p className="text-base font-medium mt-1 text-danger">{inr(emiInterestPortion)}</p>
              </div>
              <div className="rounded-xl border border-edge p-3">
                <p className="text-[11px] text-ink-mute">Principal portion</p>
                {emiPrincipalPortion > 0
                  ? <p className="text-base font-medium mt-1 text-mint-600">{inr(emiPrincipalPortion)}</p>
                  : <p className="text-base font-medium mt-1 text-danger">—</p>
                }
              </div>
              <div className="rounded-xl border border-edge p-3">
                <p className="text-[11px] text-ink-mute">Months to close</p>
                {emiMonthsToClose != null
                  ? <p className="text-base font-medium mt-1">{emiMonthsToClose} mo</p>
                  : <p className="text-base font-medium mt-1 text-danger">Never</p>
                }
              </div>
            </div>
            {emiPrincipalPortion <= 0 && (
              <p className="text-xs text-danger mb-3">⚠ Your EMI ({inr(emiAmount)}) does not cover the monthly interest ({inr(monthly)}). Increase the EMI to start reducing the principal.</p>
            )}
            {emiSchedule.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEmiSchedule(v => !v)}
                  className="text-xs text-sky-600 hover:underline mb-2">
                  {showEmiSchedule ? 'Hide amortization schedule' : `Show amortization schedule (${emiSchedule.length} month${emiSchedule.length !== 1 ? 's' : ''})`}
                </button>
                {showEmiSchedule && (
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="text-ink-mute">
                          <th className="text-left py-1.5 pr-3 font-medium">Mo.</th>
                          <th className="text-right py-1.5 pr-3 font-medium">Opening</th>
                          <th className="text-right py-1.5 pr-3 font-medium text-danger">Interest</th>
                          <th className="text-right py-1.5 pr-3 font-medium text-mint-600">Principal</th>
                          <th className="text-right py-1.5 pr-3 font-medium">EMI</th>
                          <th className="text-right py-1.5 font-medium">Closing</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-edge">
                        {emiSchedule.map(row => (
                          <tr key={row.month_number} className="hover:bg-paper-tint">
                            <td className="py-1.5 pr-3 text-ink-mute">{row.month_number}</td>
                            <td className="py-1.5 pr-3 text-right">{inr(row.opening_balance)}</td>
                            <td className="py-1.5 pr-3 text-right text-danger">{inr(row.interest)}</td>
                            <td className="py-1.5 pr-3 text-right text-mint-600">{inr(row.principal_portion)}</td>
                            <td className="py-1.5 pr-3 text-right">{inr(row.emi)}</td>
                            <td className="py-1.5 text-right font-medium">{inr(row.closing_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Bar chart visual */}
        <div className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5" title={detailTooltip}>
          <h2 className="text-sm font-medium mb-4">Overview</h2>
          <div className="flex items-end gap-4 h-28">
            {[
              { label: 'Current principal', val: Number(debt.current_principal), color: 'bg-danger' },
              { label: 'Borrowed later', val: totalTopupAmount, color: 'bg-plum-600' },
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
            {showForm ? 'Cancel' : '+ Record entry'}
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
            <h3 className="text-sm font-medium">Record debt entry</h3>

            <div>
              <label className="block text-xs text-ink-soft mb-1.5">Entry type<span className="text-danger ml-0.5">*</span></label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {PAYMENT_TYPES.map(t => (
                  <button key={t.value} type="button"
                    onClick={() => { setP('payment_type', t.value); setMultiMonth(false); }}
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
              {pForm.payment_type === 'topup' && (
                <p className="text-[11px] text-plum-600 mt-1.5">This adds extra borrowed amount to the same debt and increases future interest on the higher balance.</p>
              )}
            </div>

            {/* Month-range toggle for interest */}
            {pForm.payment_type === 'interest' && (
              <div className="flex items-center gap-2">
                <button type="button"
                  onClick={() => { setMultiMonth(v => !v); setRangeFrom(''); setRangeTo(''); setP('amount', ''); }}
                  className={`chip text-xs ${multiMonth ? 'on' : ''}`}>
                  Cover multiple months
                </button>
                {multiMonth && (
                  <span className="text-[11px] text-ink-mute">Select the month range you are paying for</span>
                )}
              </div>
            )}

            {/* Month range fields */}
            {pForm.payment_type === 'interest' && multiMonth ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-soft mb-1.5">From month<span className="text-danger ml-0.5">*</span></label>
                  <input type="month" value={rangeFrom}
                    onChange={e => setRangeFrom(e.target.value)} required className="field-input" />
                </div>
                <div>
                  <label className="block text-xs text-ink-soft mb-1.5">To month<span className="text-danger ml-0.5">*</span></label>
                  <input type="month" value={rangeTo}
                    onChange={e => setRangeTo(e.target.value)} required className="field-input" />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-ink-soft mb-1.5">Date<span className="text-danger ml-0.5">*</span></label>
                <input type="date" value={pForm.payment_date}
                  onChange={e => setP('payment_date', e.target.value)} required className="field-input" />
              </div>
            )}

            <div>
              <label className="block text-xs text-ink-soft mb-1.5">Amount (₹)<span className="text-danger ml-0.5">*</span></label>
              <input type="number" inputMode="numeric" min="1" step="1"
                placeholder={inrRaw(monthly)}
                value={pForm.amount}
                onChange={e => setP('amount', e.target.value)} required className="field-input" />
              {multiMonth && rangeFrom && rangeTo && (() => {
                const n = monthsInRange(rangeFrom, rangeTo);
                const amount = sumInterestForMonthRange(debt.interest_months || [], rangeFrom, rangeTo);
                return n > 0 ? (
                  <p className="text-[11px] text-ink-mute mt-1">
                    {n} month{n > 1 ? 's' : ''} total = <span className="text-danger font-medium">{inr(amount)}</span>
                  </p>
                ) : null;
              })()}
            </div>

            <div>
              <label className="block text-xs text-ink-soft mb-1.5">Notes <span className="text-ink-mute">(optional)</span></label>
              <input type="text"
                placeholder={multiMonth && rangeFrom && rangeTo ? 'Auto-filled on save' : 'e.g. July interest payment'}
                value={pForm.notes} onChange={e => setP('notes', e.target.value)} className="field-input" />
            </div>

            {pError && <p className="text-xs text-danger">{pError}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => { setShowForm(false); setMultiMonth(false); setRangeFrom(''); setRangeTo(''); }}
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
          <h2 className="text-sm font-medium mb-3">Transaction history</h2>

          {payments.length === 0 ? (
            <p className="text-sm text-ink-mute text-center py-6">No entries recorded yet.</p>
          ) : (
            <div className="divide-y divide-edge">
              {payments.map(p => {
                const typeColors = {
                  interest:  'bg-sky-50 text-sky-600',
                  principal: 'bg-mint-50 text-mint-600',
                  clearance: 'bg-plum-50 text-plum-600',
                  topup: 'bg-plum-50 text-plum-600',
                };
                const typeLabels = {
                  interest:  'Interest',
                  principal: 'Principal',
                  clearance: 'Clearance',
                  topup: 'Borrowed more',
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
                        title="Delete record">
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
        <section className="bg-paper-card border border-edge rounded-2xl p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div ref={shareRef} className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Shareable summary</h2>
                <span className="text-[11px] text-ink-mute">Shareable as image</span>
              </div>
              <div className="font-mono text-xs bg-paper-tint rounded-xl p-3 whitespace-pre-wrap text-ink-soft select-all">
{shareSummaryText}
              </div>
            </div>
            <div className="flex flex-col gap-2 md:w-[220px]">
              <button onClick={handleCopyShareImage}
                className="snapshot-action w-full rounded-xl px-3 py-2 text-xs font-medium">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy this section
              </button>
              <button onClick={handleShare}
                className="snapshot-action w-full rounded-xl px-3 py-2 text-xs font-medium">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                Share image
              </button>
            </div>
          </div>
        </section>

      </div>
    </Shell>
  );
}
