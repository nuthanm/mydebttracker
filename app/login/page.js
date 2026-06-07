'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import PinInput from '@/components/PinInput';

export default function LoginPage() {
  const router = useRouter();
  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState('mobile');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitMobile = (e) => {
    e.preventDefault();
    setError('');
    if (!mobile.trim()) { setError('Enter your mobile number.'); return; }
    setStep('pin');
  };

  const submitPin = async (currentPin) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, pin: currentPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not log in.');
      router.push('/home');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setPin('');
      setLoading(false);
    }
  };

  const onPinChange = (next) => {
    setPin(next);
    if (next.length === 6 && !loading) submitPin(next);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-paper-card border border-edge rounded-2xl p-7 shadow-sm anim-fade">
        <div className="w-12 h-12 rounded-2xl bg-ink text-paper flex items-center justify-center text-xl font-medium mx-auto mb-4">₹</div>

        {step === 'mobile' && (
          <form onSubmit={submitMobile}>
            <h1 className="text-xl font-medium text-center">Welcome back</h1>
            <p className="text-sm text-ink-soft text-center mt-1.5 mb-6">Log in with your mobile and PIN</p>

            <label className="block text-xs text-ink-soft mb-1.5">Mobile number<span className="text-danger ml-0.5">*</span></label>
            <input
              type="tel"
              inputMode="tel"
              autoFocus
              autoComplete="tel"
              placeholder="+91 98XXX XXXXX"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="field-input"
            />

            {error && <p className="mt-3 text-xs text-danger">{error}</p>}

            <button type="submit" className="btn-primary w-full py-2.5 rounded-lg text-sm font-medium mt-5">
              Continue
            </button>

            <div className="flex items-center gap-3 my-5 text-[11px] text-ink-mute uppercase tracking-wider">
              <div className="flex-1 h-px bg-edge" /> new here? <div className="flex-1 h-px bg-edge" />
            </div>

            <p className="text-sm text-ink-soft text-center">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-mint-600 font-medium">Sign up</Link>
            </p>
          </form>
        )}

        {step === 'pin' && (
          <div>
            <h1 className="text-lg font-medium text-center">Enter your PIN</h1>
            <p className="text-sm text-ink-soft text-center mt-1.5 mb-5">{mobile}</p>

            <PinInput value={pin} onChange={onPinChange} autoFocus />

            {error && <p className="mt-3 text-xs text-danger text-center">{error}</p>}
            {loading && <p className="mt-3 text-xs text-ink-mute text-center">Verifying…</p>}

            <button
              type="button"
              onClick={() => { setStep('mobile'); setPin(''); setError(''); }}
              className="text-xs text-ink-mute mt-5 mx-auto block"
            >
              ← change mobile number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
