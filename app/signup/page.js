'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PinInput from '@/components/PinInput';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState('details');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitDetails = (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Enter your name.'); return; }
    if (!mobile.trim()) { setError('Enter your mobile number.'); return; }
    setStep('pin');
  };

  const onPinChange = (next) => {
    setPin(next);
    if (next.length === 6) setStep('confirm');
  };

  const onConfirmChange = async (next) => {
    setConfirm(next);
    if (next.length !== 6) return;
    if (next !== pin) {
      setError('PINs do not match. Try again.');
      setPin('');
      setConfirm('');
      setStep('pin');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mobile, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create account.');
      router.push('/home');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setPin('');
      setConfirm('');
      setStep('pin');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-paper-card border border-edge rounded-2xl p-7 shadow-sm anim-fade">
        <div className="w-12 h-12 rounded-2xl bg-ink text-paper flex items-center justify-center text-xl font-medium mx-auto mb-4">₹</div>

        {step === 'details' && (
          <form onSubmit={submitDetails}>
            <h1 className="text-xl font-medium text-center">Create account</h1>
            <p className="text-sm text-ink-soft text-center mt-1.5 mb-6">Track all your debts in one place</p>

            <label className="block text-xs text-ink-soft mb-1.5">Your name<span className="text-danger ml-0.5">*</span></label>
            <input type="text" autoFocus autoComplete="name" placeholder="Full name"
              value={name} onChange={(e) => setName(e.target.value)} className="field-input mb-3" />

            <label className="block text-xs text-ink-soft mb-1.5">Mobile number<span className="text-danger ml-0.5">*</span></label>
            <input type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98XXX XXXXX"
              value={mobile} onChange={(e) => setMobile(e.target.value)} className="field-input" />

            {error && <p className="mt-3 text-xs text-danger">{error}</p>}

            <button type="submit" className="btn-primary w-full py-2.5 rounded-lg text-sm font-medium mt-5">
              Continue
            </button>

            <p className="text-sm text-ink-soft text-center mt-5">
              Already have an account?{' '}
              <Link href="/login" className="text-mint-600 font-medium">Log in</Link>
            </p>
          </form>
        )}

        {step === 'pin' && (
          <div>
            <h1 className="text-lg font-medium text-center">Set your PIN</h1>
            <p className="text-sm text-ink-soft text-center mt-1.5 mb-5">Choose a 6-digit PIN</p>
            <PinInput value={pin} onChange={onPinChange} autoFocus />
            {error && <p className="mt-3 text-xs text-danger text-center">{error}</p>}
            <button type="button" onClick={() => { setStep('details'); setPin(''); setError(''); }}
              className="text-xs text-ink-mute mt-5 mx-auto block">← back</button>
          </div>
        )}

        {step === 'confirm' && (
          <div>
            <h1 className="text-lg font-medium text-center">Confirm your PIN</h1>
            <p className="text-sm text-ink-soft text-center mt-1.5 mb-5">Enter the same PIN again</p>
            <PinInput value={confirm} onChange={onConfirmChange} autoFocus />
            {error && <p className="mt-3 text-xs text-danger text-center">{error}</p>}
            {loading && <p className="mt-3 text-xs text-ink-mute text-center">Creating account…</p>}
          </div>
        )}
      </div>
    </div>
  );
}
