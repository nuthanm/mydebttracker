'use client';

import { useEffect, useState } from 'react';

let _resolveQueue = [];

export function appConfirm(message) {
  return new Promise(resolve => {
    _resolveQueue.push(resolve);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:confirm', { detail: { message } }));
    }
  });
}

export default function ConfirmDialog() {
  const [state, setState] = useState({ open: false, message: '' });

  useEffect(() => {
    const handle = (e) => setState({ open: true, message: e.detail.message });
    window.addEventListener('app:confirm', handle);
    return () => window.removeEventListener('app:confirm', handle);
  }, []);

  const resolve = (result) => {
    setState(s => ({ ...s, open: false }));
    const fn = _resolveQueue.shift();
    if (fn) fn(result);
  };

  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50">
      <div className="bg-paper-card border border-edge rounded-2xl p-5 max-w-xs w-full mx-4 shadow-xl anim-fade">
        <p className="text-sm text-ink mb-5 leading-relaxed">{state.message}</p>
        <div className="flex gap-3">
          <button
            onClick={() => resolve(false)}
            className="btn-ghost flex-1 py-2 rounded-lg text-sm">
            Cancel
          </button>
          <button
            onClick={() => resolve(true)}
            className="btn-primary flex-1 py-2 rounded-lg text-sm font-medium">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
