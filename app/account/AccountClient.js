'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Shell from '@/components/Shell';
import PinInput from '@/components/PinInput';
import { appConfirm } from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';
import { exportDashboardWorkbook } from '@/lib/export';

export default function AccountClient({ user }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinStep, setPinStep] = useState('idle');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [changingPin, setChangingPin] = useState(false);

  const resetPinFlow = () => {
    setPinStep('idle');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError('');
    setChangingPin(false);
  };

  const startPinFlow = () => {
    setPinStep('current');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError('');
  };

  const submitPinChange = async (nextConfirmPin) => {
    if (changingPin) return;
    try {
      const payload = { currentPin, newPin, confirmPin: nextConfirmPin };
      setPinError('');
      setChangingPin(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  const onCurrentPinChange = (next) => {
    setCurrentPin(next);
    if (next.length === 6) {
      setPinError('');
      setPinStep('new');
    }
  };

  const onNewPinChange = (next) => {
    setNewPin(next);
    if (next.length === 6) {
      setPinError('');
      setPinStep('confirm');
    }
  };

  const onConfirmPinChange = (next) => {
    setConfirmPin(next);
    if (next.length === 6 && !changingPin) submitPinChange(next);
  };

  const handleLogout = async () => {
    setLoading(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleExportData = async () => {
    try {
      setExporting(true);
      const res = await fetch('/api/debts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not export account data.');
      exportDashboardWorkbook({
        summary: data.summary || {},
        debts: data.debts || [],
        dashboard: data.dashboard || {},
        filters: data.filters || {},
      });
      toast('Account data export ready.');
    } catch (err) {
      toast(err.message || 'Could not export account data.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!await appConfirm(
      'Delete account permanently? This action cannot be undone and will immediately remove all your data including debts and payment history.\n'
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

  const initials = (user?.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <Shell user={user}>
      <div className="px-4 md:px-8 py-5 md:py-6 max-w-md mx-auto w-full">
        <h1 className="text-xl font-medium mb-5">Account</h1>

        <div className="bg-paper-card border border-edge rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-ember-50 text-ember-600 flex items-center justify-center text-xl font-medium">
              {initials}
            </div>
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-ink-mute">{user.mobile}</p>
            </div>
          </div>

          <div className="border-t border-edge pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-ink-mute">Name</span>
              <span className="font-medium">{user.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-mute">Mobile</span>
              <span className="font-medium">{user.mobile}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-paper-card border border-edge rounded-2xl p-4">
            {pinStep === 'idle' ? (
              <button
                onClick={startPinFlow}
                disabled={loading || deleting}
                className="btn-ghost w-full py-2.5 rounded-lg text-sm font-medium"
              >
                Change PIN
              </button>
            ) : (
              <>
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
                  onChange={pinStep === 'current' ? onCurrentPinChange : pinStep === 'new' ? onNewPinChange : onConfirmPinChange}
                  autoFocus
                />
                {pinError && <p className="mt-3 text-xs text-danger text-center">{pinError}</p>}
                {changingPin && <p className="mt-3 text-xs text-ink-mute text-center">Updating PIN…</p>}
                <button
                  type="button"
                  onClick={resetPinFlow}
                  className="text-xs text-ink-mute mt-4 mx-auto block"
                >
                  Cancel
                </button>
              </>
            )}
          </div>

          <button
            onClick={handleLogout}
            disabled={loading || deleting || changingPin}
            className="btn-danger w-full py-2.5 rounded-lg text-sm font-medium">
            {loading ? 'Logging out…' : 'Log out'}
          </button>

          <div className="bg-paper-card border border-danger/20 rounded-2xl p-4">
            <h2 className="text-sm font-medium text-danger">Delete account</h2>
            <p className="text-xs text-ink-mute mt-1.5 leading-relaxed">
              Once you delete your account, all your data is deleted immediately and cannot be recovered.
              If you want your records, export your data first and then delete the account.
            </p>
            <div className="mt-3 grid sm:grid-cols-2 gap-2">
              <button
                onClick={handleExportData}
                disabled={exporting || deleting || changingPin}
                className="btn-ghost py-2.5 rounded-lg text-sm"
              >
                {exporting ? 'Exporting…' : 'Export your data'}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || loading || changingPin}
                className="btn-danger py-2.5 rounded-lg text-sm font-medium"
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
