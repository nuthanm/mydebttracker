'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/components/Toast';

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function copyText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    toast(`${label} copied.`);
  } catch {
    toast('Could not copy. Select the text and copy it manually.');
  }
}

export default function ViewLinkSection() {
  const [status, setStatus] = useState(null);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState('');

  const loadStatus = async () => {
    const res = await fetch('/api/view-links', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setStatus(data);
  };

  useEffect(() => {
    loadStatus().catch(() => setError('Could not load the view link.'));
  }, []);

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/view-links', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create a view link.');
      setIssued(data);
      setConfirming('');
      await loadStatus();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const revoke = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/view-links', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not revoke the view link.');
      setIssued(null);
      setConfirming('');
      await loadStatus();
      toast('View link revoked.');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const fullLink = issued ? `${window.location.origin}${issued.path}` : '';
  const shareText = issued ? `View link: ${fullLink}\nPassword: ${issued.password}` : '';
  const locked = status?.lockedUntil && new Date(status.lockedUntil).getTime() > Date.now();

  return (
    <>
      <p className="text-[11px] tracking-wider text-ink-mute uppercase mb-2">Private view</p>
      <div className="bg-paper-card border border-edge rounded-2xl mb-5 px-4 py-3.5">
        <p className="text-sm">View link</p>
        <p className="text-xs text-ink-soft mt-1">
          Generate a private link and a random password. Anyone with both can see these debts and payments, and they cannot add, edit, delete, or export them. Your login stays yours.
        </p>

        {status?.active && !issued && (
          <div className="mt-3 text-xs text-ink-soft space-y-1">
            <p>A view link is active{status.createdAt ? ` since ${formatWhen(status.createdAt)}` : ''}.</p>
            <p>{status.lastViewedAt ? `Last opened ${formatWhen(status.lastViewedAt)}.` : 'It has not been opened yet.'}</p>
            {locked && <p>Password attempts are paused until {formatWhen(status.lockedUntil)}.</p>}
          </div>
        )}

        {issued && (
          <div className="mt-4 rounded-xl border border-honey-600/30 bg-honey-50 px-3 py-3">
            <p className="text-sm font-medium text-honey-600">Copy the link and password now</p>
            <p className="text-[11px] text-honey-600/80 mt-1">
              The password is shown only this once. Closing this panel does not reveal it again. Send the password in a separate message from the link when you can.
            </p>
            <label className="block text-[11px] text-ink-soft mt-3 mb-1">Link</label>
            <div className="flex gap-2">
              <input readOnly value={fullLink} className="field-input text-xs" spellCheck={false} />
              <button type="button" onClick={() => copyText(fullLink, 'Link')} className="text-xs px-3 py-2 rounded-lg border border-edge bg-paper-card">Copy</button>
            </div>
            <label className="block text-[11px] text-ink-soft mt-3 mb-1">Password</label>
            <div className="flex gap-2">
              <input readOnly value={issued.password} className="field-input text-xs tracking-wide" spellCheck={false} />
              <button type="button" onClick={() => copyText(issued.password, 'Password')} className="text-xs px-3 py-2 rounded-lg border border-edge bg-paper-card">Copy</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => copyText(shareText, 'Link and password')} className="btn-primary text-xs px-3 py-2 rounded-lg">Copy both</button>
              <button type="button" onClick={() => setIssued(null)} className="text-xs px-3 py-2 rounded-lg border border-edge bg-paper-card">I have saved them</button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger mt-3">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {!status?.active && (
            <button type="button" onClick={generate} disabled={busy || status === null} className="btn-primary text-xs px-3 py-2 rounded-lg">
              {busy ? 'Generating…' : 'Generate view link'}
            </button>
          )}
          {status?.active && confirming !== 'replace' && confirming !== 'revoke' && (
            <>
              <button type="button" onClick={() => setConfirming('replace')} disabled={busy} className="text-xs px-3 py-2 rounded-lg border border-edge">
                Replace link
              </button>
              <button type="button" onClick={() => setConfirming('revoke')} disabled={busy} className="text-xs px-3 py-2 rounded-lg border border-edge text-danger">
                Revoke
              </button>
            </>
          )}
        </div>

        {confirming === 'replace' && (
          <div className="mt-3 text-xs text-ink-soft">
            <p>This turns off the current link and password immediately.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={generate} disabled={busy} className="btn-primary text-xs px-3 py-2 rounded-lg">{busy ? 'Replacing…' : 'Replace now'}</button>
              <button type="button" onClick={() => setConfirming('')} className="text-xs px-3 py-2 rounded-lg border border-edge">Cancel</button>
            </div>
          </div>
        )}

        {confirming === 'revoke' && (
          <div className="mt-3 text-xs text-ink-soft">
            <p>Anyone using this link will lose access immediately.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={revoke} disabled={busy} className="text-xs px-3 py-2 rounded-lg bg-danger text-paper font-medium">{busy ? 'Revoking…' : 'Revoke now'}</button>
              <button type="button" onClick={() => setConfirming('')} className="text-xs px-3 py-2 rounded-lg border border-edge">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
