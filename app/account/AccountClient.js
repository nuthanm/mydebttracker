'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Shell from '@/components/Shell';
import PinInput from '@/components/PinInput';
import { appConfirm } from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';

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

export default function AccountClient({ user }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [loading, setLoading] = useState(false);
  const [pinStep, setPinStep] = useState('idle');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [changingPin, setChangingPin] = useState(false);

  const [recoveryModal, setRecoveryModal] = useState(false);
  const [recoveryCurrentPin, setRecoveryCurrentPin] = useState('');
  const [newRecoveryKey, setNewRecoveryKey] = useState('');
  const [confirmRecoveryKey, setConfirmRecoveryKey] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [savingRecovery, setSavingRecovery] = useState(false);

  const [mfaEnabled, setMfaEnabled] = useState(!!user.mfaEnabled);
  const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
  const [mfaDisableOpen, setMfaDisableOpen] = useState(false);
  const [mfaSetupSecret, setMfaSetupSecret] = useState('');
  const [mfaQrCode, setMfaQrCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaDisablePin, setMfaDisablePin] = useState('');
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const [exportLoading, setExportLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  const resetPinFlow = () => {
    setPinStep('idle');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError('');
    setChangingPin(false);
  };

  const saveName = async () => {
    if (!name.trim()) return;
    setSavingName(true);
    await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    setEditingName(false);
    setSavingName(false);
    router.refresh();
  };

  const submitPinChange = async (confirmedPin) => {
    if (changingPin) return;
    try {
      setPinError('');
      setChangingPin(true);
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin, confirmPin: confirmedPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change PIN.');
      toast('PIN changed successfully.');
      resetPinFlow();
    } catch (err) {
      setPinError(err.message || 'Could not change PIN.');
      setChangingPin(false);
      setPinStep('current');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    }
  };

  const saveRecoveryKey = async () => {
    setRecoveryError('');
    if (!recoveryCurrentPin || !newRecoveryKey) {
      setRecoveryError('Current PIN and new recovery key are required.');
      return;
    }
    if (newRecoveryKey.length < 8) {
      setRecoveryError('Recovery key must be at least 8 characters.');
      return;
    }
    if (newRecoveryKey !== confirmRecoveryKey) {
      setRecoveryError('Recovery keys do not match.');
      return;
    }

    setSavingRecovery(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin: recoveryCurrentPin, newRecoveryKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update recovery key.');
      setRecoveryModal(false);
      setRecoveryCurrentPin('');
      setNewRecoveryKey('');
      setConfirmRecoveryKey('');
      toast('Recovery key updated.');
    } catch (err) {
      setRecoveryError(err.message);
    }
    setSavingRecovery(false);
  };

  const startMfaSetup = async () => {
    setMfaError('');
    setMfaLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start MFA setup.');
      setMfaSetupSecret(data.manualSecret || '');
      setMfaQrCode(data.qrCodeDataUrl || '');
      setMfaSetupOpen(true);
    } catch (err) {
      setMfaError(err.message);
    }
    setMfaLoading(false);
  };

  const enableMfa = async () => {
    setMfaError('');
    if (!mfaCode.trim()) {
      setMfaError('Enter the verification code from your authenticator app.');
      return;
    }
    setMfaLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mfaCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not enable MFA.');
      setMfaEnabled(true);
      setMfaSetupOpen(false);
      setMfaCode('');
      toast('MFA enabled.');
    } catch (err) {
      setMfaError(err.message);
    }
    setMfaLoading(false);
  };

  const disableMfa = async () => {
    setMfaError('');
    if (!mfaDisablePin || !mfaDisableCode) {
      setMfaError('Current PIN and MFA code are required.');
      return;
    }
    setMfaLoading(true);
    try {
      const res = await fetch('/api/auth/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin: mfaDisablePin, code: mfaDisableCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not disable MFA.');
      setMfaEnabled(false);
      setMfaDisableOpen(false);
      setMfaDisablePin('');
      setMfaDisableCode('');
      toast('MFA disabled.');
    } catch (err) {
      setMfaError(err.message);
    }
    setMfaLoading(false);
  };

  const exportData = async () => {
    setExportLoading(true);
    try {
      const res = await fetch('/api/auth/export');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not export data.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mydebttracker-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Excel export downloaded.');
    } catch (err) {
      toast(err.message || 'Could not export data.', 'error');
    }
    setExportLoading(false);
  };

  const handleLogout = async () => {
    setLoading(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleDeleteAccount = async () => {
    if (!await appConfirm(
      'Delete account permanently? This cannot be undone.\n'
      + 'Export your data first if you want to keep a copy.'
    )) return;
    try {
      setDeleting(true);
      const res = await fetch('/api/account', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete account.');
      toast('Account deleted permanently.', 'info');
      router.push('/signup');
      router.refresh();
    } catch (err) {
      toast(err.message || 'Could not delete account.', 'error');
      setDeleting(false);
    }
  };

  return (
    <Shell user={user}>
      <div className="px-4 md:px-8 py-5 md:py-6 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl md:text-3xl font-medium tracking-tight mb-1">Account</h1>
        <p className="text-sm text-ink-soft mb-6">Manage your profile, security, and export your data anytime.</p>

        <div className="flex items-center gap-3.5 p-4 bg-paper-tint rounded-2xl mb-6">
          <div className="w-12 h-12 rounded-full bg-ember-50 text-ember-600 flex items-center justify-center font-medium">{initials}</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">{user.name}</p>
            <p className="text-xs text-ink-soft mt-0.5">{user.mobile}</p>
          </div>
        </div>

        <p className="text-[11px] tracking-wider text-ink-mute uppercase mb-2">Profile</p>
        <div className="bg-paper-card border border-edge rounded-2xl mb-5">
          <div className="px-4 py-3.5 border-b border-edge">
            {!editingName ? (
              <button onClick={() => setEditingName(true)} className="w-full flex justify-between items-center text-left">
                <span className="text-sm">Name</span>
                <span className="text-xs text-ink-soft">{user.name} ›</span>
              </button>
            ) : (
              <div className="flex gap-2 items-center">
                <input value={name} onChange={(e) => setName(e.target.value)} className="field-input flex-1" autoFocus />
                <button onClick={() => { setName(user.name); setEditingName(false); }} className="text-xs text-ink-mute px-2">cancel</button>
                <button onClick={saveName} disabled={savingName} className="btn-primary text-xs px-3 py-2 rounded-lg">{savingName ? '…' : 'save'}</button>
              </div>
            )}
          </div>
          <div className="px-4 py-3.5 border-b border-edge flex justify-between items-center">
            <span className="text-sm">Mobile</span>
            <span className="text-xs text-ink-soft">{user.mobile}</span>
          </div>
          <div className="px-4 py-3.5 border-b border-edge">
            {pinStep === 'idle' ? (
              <button onClick={() => setPinStep('current')} className="w-full flex justify-between items-center text-left">
                <span className="text-sm">Change PIN</span>
                <span className="text-xs text-ink-soft">›</span>
              </button>
            ) : (
              <div>
                <h2 className="text-sm font-medium text-center">
                  {pinStep === 'current' ? 'Enter current PIN' : pinStep === 'new' ? 'Set new PIN' : 'Confirm new PIN'}
                </h2>
                <p className="text-xs text-ink-mute text-center mt-1 mb-4">
                  {pinStep === 'current' ? 'Verify your current PIN first'
                    : pinStep === 'new' ? 'Choose a 6-digit PIN'
                      : 'Enter the same PIN again'}
                </p>
                <PinInput
                  value={pinStep === 'current' ? currentPin : pinStep === 'new' ? newPin : confirmPin}
                  onChange={(next) => {
                    if (pinStep === 'current') {
                      setCurrentPin(next);
                      if (next.length === 6) { setPinError(''); setPinStep('new'); }
                    } else if (pinStep === 'new') {
                      setNewPin(next);
                      if (next.length === 6) { setPinError(''); setPinStep('confirm'); }
                    } else {
                      setConfirmPin(next);
                      if (next.length === 6 && !changingPin) submitPinChange(next);
                    }
                  }}
                  autoFocus
                />
                {pinError && <p className="mt-3 text-xs text-danger text-center">{pinError}</p>}
                {changingPin && <p className="mt-3 text-xs text-ink-mute text-center">Updating PIN…</p>}
                <button type="button" onClick={resetPinFlow} className="text-xs text-ink-mute mt-4 mx-auto block">Cancel</button>
              </div>
            )}
          </div>
          <button onClick={() => setRecoveryModal(true)} className="w-full px-4 py-3.5 flex justify-between items-center hover:bg-paper-tint/50 transition">
            <span className="text-sm text-left">Rotate recovery key</span>
            <span className="text-xs text-ink-soft">›</span>
          </button>
        </div>

        <p className="text-[11px] tracking-wider text-ink-mute uppercase mb-2">Security</p>
        <div className="bg-paper-card border border-edge rounded-2xl mb-5">
          <div className="px-4 py-3.5 border-b border-edge flex justify-between items-center">
            <div>
              <p className="text-sm">Authenticator MFA</p>
              <p className="text-xs text-ink-soft mt-0.5">{mfaEnabled ? 'Enabled' : 'Not enabled'}</p>
            </div>
            {!mfaEnabled ? (
              <button onClick={startMfaSetup} disabled={mfaLoading} className="btn-primary text-xs px-3 py-2 rounded-lg">
                {mfaLoading ? 'Starting…' : 'Enable MFA'}
              </button>
            ) : (
              <button onClick={() => setMfaDisableOpen(true)} className="text-xs px-3 py-2 rounded-lg border border-edge">
                Disable MFA
              </button>
            )}
          </div>

          <div className="px-4 py-3.5 border-b border-edge flex justify-between items-center">
            <div>
              <p className="text-sm">Export your data</p>
              <p className="text-xs text-ink-soft mt-0.5">Download all records as Excel. No data is removed.</p>
            </div>
            <button onClick={exportData} disabled={exportLoading} className="text-xs px-3 py-2 rounded-lg border border-edge">
              {exportLoading ? 'Preparing…' : 'Export (Excel)'}
            </button>
          </div>

          <a href="/account/security-activity" className="w-full px-4 py-3.5 flex justify-between items-center hover:bg-paper-tint/50 transition">
            <span className="text-sm">Security activity</span>
            <span className="text-xs text-ink-soft">›</span>
          </a>

          {mfaError && !mfaSetupOpen && !mfaDisableOpen && <p className="px-4 pb-3 text-xs text-danger">{mfaError}</p>}
        </div>

        <p className="text-[11px] tracking-wider text-ink-mute uppercase mb-2">Session</p>
        <div className="bg-paper-card border border-edge rounded-2xl mb-5">
          <button onClick={handleLogout} disabled={loading || deleting} className="w-full px-4 py-3.5 text-left text-sm hover:bg-paper-tint/50 transition">
            {loading ? 'Logging out…' : 'Log out'}
          </button>
        </div>

        <p className="text-[11px] tracking-wider text-ink-mute uppercase mb-2">Danger zone</p>
        <div className="bg-paper-card border border-edge rounded-2xl mb-5">
          <button onClick={handleDeleteAccount} disabled={deleting} className="w-full px-4 py-3.5 flex justify-between items-center hover:bg-danger-soft/40 transition">
            <span className="text-sm text-danger text-left">{deleting ? 'Deleting…' : 'Delete account'}</span>
            <span className="text-xs text-danger">›</span>
          </button>
          <p className="px-4 pb-3 text-xs text-ink-soft">This permanently removes your account and related debt data.</p>
        </div>
      </div>

      {recoveryModal && (
        <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4 anim-fade" onClick={() => setRecoveryModal(false)}>
          <div className="bg-paper-card rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-medium text-center mb-1">Rotate recovery key</h2>
            <p className="text-sm text-ink-soft text-center mb-5">Store this in a safe place. It helps recover your account.</p>
            <label className="block text-xs text-ink-soft mb-1.5">Current PIN</label>
            <input type="password" inputMode="numeric" maxLength={6} value={recoveryCurrentPin} onChange={(e) => setRecoveryCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="field-input mb-3" autoFocus />
            <label className="block text-xs text-ink-soft mb-1.5">New recovery key</label>
            <input type="password" value={newRecoveryKey} onChange={(e) => setNewRecoveryKey(e.target.value)} className="field-input mb-3" />
            <label className="block text-xs text-ink-soft mb-1.5">Confirm recovery key</label>
            <input type="password" value={confirmRecoveryKey} onChange={(e) => setConfirmRecoveryKey(e.target.value)} className="field-input" />
            {recoveryError && <p className="text-xs text-danger text-center mt-3">{recoveryError}</p>}
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={() => setRecoveryModal(false)} className="text-xs px-3 py-2 border border-edge rounded-lg">Cancel</button>
              <button onClick={saveRecoveryKey} className="btn-primary text-xs px-3 py-2 rounded-lg" disabled={savingRecovery}>Save key</button>
            </div>
          </div>
        </div>
      )}

      {mfaSetupOpen && (
        <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4 anim-fade" onClick={() => setMfaSetupOpen(false)}>
          <div className="bg-paper-card rounded-2xl p-5 sm:p-6 md:p-7 w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg sm:text-xl font-medium text-center mb-1">Enable MFA</h2>
            <p className="text-sm text-ink-soft text-center mb-4">Scan with any of these authenticator apps:</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-3 items-start">
              <div className="bg-edge/30 rounded-lg p-3 sm:p-4 space-y-2.5">
                {AUTHENTICATOR_APPS.map((app) => (
                  <div key={app.name} className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm text-ink-soft pr-2">{app.name}</span>
                    <div className="flex gap-1.5">
                      <a href={app.ios} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 bg-mint-50 text-mint-600 text-[10px] sm:text-xs rounded hover:bg-mint-100 transition whitespace-nowrap">iOS</a>
                      <a href={app.android} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 bg-mint-50 text-mint-600 text-[10px] sm:text-xs rounded hover:bg-mint-100 transition whitespace-nowrap">Android</a>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-edge/20 rounded-lg p-3 sm:p-4 border border-edge">
                {mfaQrCode ? <img src={mfaQrCode} alt="MFA QR code" className="w-36 h-36 sm:w-40 sm:h-40 mx-auto mb-2 rounded-lg border border-edge" /> : null}
                <p className="text-xs text-ink-soft break-all text-center">Manual code: {mfaSetupSecret}</p>
              </div>
            </div>

            <div className="bg-edge/30 border border-edge rounded-lg p-3 mb-3">
              <p className="text-xs font-medium text-ink mb-1.5">Need help resetting MFA entry?</p>
              <ol className="text-[11px] text-ink-soft space-y-1 list-decimal pl-4">
                <li>Disable MFA in this account screen.</li>
                <li>Delete the old MyDebtTracker entry in your authenticator app.</li>
                <li>Enable MFA again and scan the new QR code.</li>
                <li>Enter the fresh 6-digit code and confirm.</li>
              </ol>
            </div>

            <label className="block text-xs text-ink-soft mb-1.5">Verification code</label>
            <input type="text" inputMode="numeric" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="field-input" placeholder="123456" />
            {mfaError && <p className="text-xs text-danger text-center mt-3">{mfaError}</p>}
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={() => setMfaSetupOpen(false)} className="text-xs px-3 py-2 border border-edge rounded-lg">Cancel</button>
              <button onClick={enableMfa} className="btn-primary text-xs px-3 py-2 rounded-lg" disabled={mfaLoading}>Enable</button>
            </div>
          </div>
        </div>
      )}

      {mfaDisableOpen && (
        <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4 anim-fade" onClick={() => setMfaDisableOpen(false)}>
          <div className="bg-paper-card rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-medium text-center mb-1">Disable MFA</h2>
            <p className="text-sm text-ink-soft text-center mb-4">Confirm PIN and current authenticator code.</p>
            <label className="block text-xs text-ink-soft mb-1.5">Current PIN</label>
            <input type="password" inputMode="numeric" maxLength={6} value={mfaDisablePin} onChange={(e) => setMfaDisablePin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="field-input mb-3" />
            <label className="block text-xs text-ink-soft mb-1.5">MFA code</label>
            <input type="text" inputMode="numeric" value={mfaDisableCode} onChange={(e) => setMfaDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="field-input" placeholder="123456" />
            {mfaError && <p className="text-xs text-danger text-center mt-3">{mfaError}</p>}
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={() => setMfaDisableOpen(false)} className="text-xs px-3 py-2 border border-edge rounded-lg">Cancel</button>
              <button onClick={disableMfa} className="btn-primary text-xs px-3 py-2 rounded-lg" disabled={mfaLoading}>Disable</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
