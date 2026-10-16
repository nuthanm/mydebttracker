'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ViewUnlockClient({ token }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!password.trim()) {
      setError('Enter the view password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/view/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not open this view.');
      setPassword('');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-paper-card border border-edge rounded-2xl p-7 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-ink text-paper flex items-center justify-center text-xl font-medium mx-auto mb-4">₹</div>
        <h1 className="text-xl font-medium text-center">Private view</h1>
        <p className="text-sm text-ink-soft text-center mt-1.5 mb-6">
          Enter the password that came with this link. You can look at the debts and payments, and nothing can be changed.
        </p>
        <label className="block text-xs text-ink-soft mb-1.5" htmlFor="view-password">View password</label>
        <input
          id="view-password"
          type="password"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="field-input"
        />
        {error && <p className="text-xs text-danger text-center mt-3">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 rounded-lg text-sm font-medium mt-5">
          {loading ? 'Opening…' : 'Open view'}
        </button>
        <p className="text-[11px] text-ink-mute text-center mt-4">
          This stays open on this device for 24 hours. It does not sign you into an account.
        </p>
      </form>
    </div>
  );
}
