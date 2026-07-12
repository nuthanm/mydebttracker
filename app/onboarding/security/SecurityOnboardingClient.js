'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const AUTHENTICATOR_APPS = [
  {
    name: 'Google Authenticator',
    ios: 'https://apps.apple.com/app/google-authenticator/id388497605',
    android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
  },
  {
    name: 'Microsoft Authenticator',
    ios: 'https://apps.apple.com/app/microsoft-authenticator/id981149162',
    android: 'https://play.google.com/store/apps/details?id=com.azure.authenticator',
  },
  {
    name: 'Authy',
    ios: 'https://apps.apple.com/app/authy/id494868406',
    android: 'https://play.google.com/store/apps/details?id=com.authy.authy',
  },
  {
    name: '1Password',
    ios: 'https://apps.apple.com/app/1password-password-manager/id568903335',
    android: 'https://play.google.com/store/apps/details?id=com.onepassword.android',
  },
];

export default function SecurityOnboardingClient({ user }) {
  const router = useRouter();
  const [step, setStep] = useState('choice');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAuthApps, setShowAuthApps] = useState(false);

  const skipFor7Days = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not set reminder.');
      router.push('/home');
      router.refresh();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const beginMfa = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start MFA setup.');
      setQr(data.qrCodeDataUrl || '');
      setSecret(data.manualSecret || '');
      setStep('verify');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const verifyMfa = async () => {
    if (!code.trim()) {
      setError('Enter your authenticator code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not enable MFA.');
      router.push('/home');
      router.refresh();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <main className="onboard-wrap">
      <section className="onboard-card anim-fade">
        <p className="onboard-kicker">Welcome, {user.name?.split(' ')[0] || 'there'}</p>
        <div className="onboard-progress" aria-label="Onboarding progress">
          <div className="onboard-progress-item done">
            <span>1</span>
            <small>Create account</small>
          </div>
          <div className={`onboard-progress-item ${step === 'verify' ? 'done' : 'active'}`}>
            <span>2</span>
            <small>Secure account</small>
          </div>
          <div className="onboard-progress-item">
            <span>3</span>
            <small>Enter app</small>
          </div>
        </div>

        {step === 'choice' ? (
          <>
            <h1>Secure your account before you start</h1>
            <p>
              Enable multi-factor authentication now to protect your debt records.
              You can also skip and set it up later in Account settings.
            </p>

            <div className="onboard-points">
              <div>Protects your account beyond PIN-only access</div>
              <div>Works with free authenticator apps</div>
              <div>Takes under 60 seconds to finish</div>
            </div>

            <div className="mt-5 p-4 bg-edge/50 rounded-lg border border-edge">
              <button
                type="button"
                onClick={() => setShowAuthApps(!showAuthApps)}
                className="flex items-center justify-between w-full text-sm font-medium text-ink-soft hover:text-ink transition-colors"
              >
                <span>Supported authenticator apps</span>
                <span className={`transition-transform ${showAuthApps ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {showAuthApps && (
                <div className="mt-3 space-y-2">
                  {AUTHENTICATOR_APPS.map((app) => (
                    <div key={app.name} className="flex items-center justify-between text-xs">
                      <span className="text-ink-soft">{app.name}</span>
                      <div className="flex gap-2">
                        <a href={app.ios} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-mint-50 text-mint-600 rounded text-[11px]">iOS</a>
                        <a href={app.android} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-mint-50 text-mint-600 rounded text-[11px]">Android</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="mt-3 text-xs text-danger">{error}</p>}

            <div className="onboard-actions">
              <button type="button" onClick={beginMfa} disabled={loading} className="btn-primary px-4 py-2.5 rounded-lg text-sm font-medium">
                {loading ? 'Starting…' : 'Enable MFA now'}
              </button>
              <button type="button" onClick={skipFor7Days} disabled={loading} className="btn-ghost px-4 py-2.5 rounded-lg text-sm">
                Remind me in 7 days
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Scan and verify</h1>
            <p>Open your authenticator app, scan the QR code, then enter the 6-digit code.</p>
            {qr ? <img src={qr} alt="MFA QR code" className="onboard-qr block" /> : null}
            <p className="onboard-secret text-center text-ink-soft">Manual secret: {secret}</p>
            <label className="block text-xs text-ink-soft mb-1.5">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="field-input"
              placeholder="123456"
            />
            {error && <p className="mt-3 text-xs text-danger">{error}</p>}
            <div className="onboard-actions">
              <button type="button" onClick={() => setStep('choice')} className="btn-ghost px-4 py-2.5 rounded-lg text-sm">Back</button>
              <button type="button" onClick={verifyMfa} disabled={loading} className="btn-primary px-4 py-2.5 rounded-lg text-sm font-medium">
                {loading ? 'Verifying…' : 'Verify and finish'}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
