'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { toast } from '@/components/Toast';
import { inr, monthlyInterest } from '@/lib/format';

export default function NewDebtClient({ user }) {
  const router = useRouter();
  const [form, setForm] = useState({
    lender_name: '',
    principal: '',
    interest_rate: '',
    start_date: new Date().toISOString().slice(0, 10),
    target_date: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const monthlyAmt = form.principal && form.interest_rate
    ? monthlyInterest(parseFloat(form.principal) || 0, parseFloat(form.interest_rate) || 0)
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lender_name: form.lender_name,
          principal: form.principal,
          interest_rate: form.interest_rate,
          start_date: form.start_date,
          target_date: form.target_date || undefined,
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add debt.');
      toast('Debt added!');
      router.push(`/debts/${data.debt.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Shell user={user}>
      <div className="px-4 md:px-8 py-5 md:py-6 max-w-lg mx-auto w-full">
        <div className="mb-5">
          <h1 className="text-xl font-medium">Add a debt</h1>
          <p className="text-sm text-ink-mute mt-1">Record money you borrowed and start tracking interest.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 bg-paper-card border border-edge rounded-2xl p-5">

          {/* Lender name */}
          <div>
            <label className="block text-xs text-ink-soft mb-1.5">From whom (lender name)<span className="text-danger ml-0.5">*</span></label>
            <input
              type="text"
              placeholder="e.g. Uncle Raju, SBI Bank"
              value={form.lender_name}
              onChange={e => set('lender_name', e.target.value)}
              required
              className="field-input"
            />
          </div>

          {/* Principal */}
          <div>
            <label className="block text-xs text-ink-soft mb-1.5">Amount borrowed (₹)<span className="text-danger ml-0.5">*</span></label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="50000"
              value={form.principal}
              onChange={e => set('principal', e.target.value)}
              required
              className="field-input"
            />
          </div>

          {/* Interest rate */}
          <div>
            <label className="block text-xs text-ink-soft mb-1.5">Monthly interest rate (%)<span className="text-danger ml-0.5">*</span></label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="2"
              value={form.interest_rate}
              onChange={e => set('interest_rate', e.target.value)}
              required
              className="field-input"
            />
            {monthlyAmt > 0 && (
              <p className="text-xs text-ink-mute mt-1.5">
                Monthly interest: <span className="text-danger font-medium">{inr(monthlyAmt)}</span>
              </p>
            )}
          </div>

          {/* Start date */}
          <div>
            <label className="block text-xs text-ink-soft mb-1.5">Start date<span className="text-danger ml-0.5">*</span></label>
            <input
              type="date"
              value={form.start_date}
              onChange={e => set('start_date', e.target.value)}
              required
              className="field-input"
            />
          </div>

          {/* Target date (optional) */}
          <div>
            <label className="block text-xs text-ink-soft mb-1.5">Target clearance date <span className="text-ink-mute">(optional)</span></label>
            <input
              type="date"
              value={form.target_date}
              onChange={e => set('target_date', e.target.value)}
              className="field-input"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-ink-soft mb-1.5">Notes <span className="text-ink-mute">(optional)</span></label>
            <textarea
              rows={2}
              placeholder="Any extra details…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="field-input resize-none"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => router.back()}
              className="btn-ghost flex-1 py-2.5 rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-medium">
              {saving ? 'Saving…' : 'Add debt'}
            </button>
          </div>

        </form>
      </div>
    </Shell>
  );
}
