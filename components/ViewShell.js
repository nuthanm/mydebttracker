'use client';

import { useRouter } from 'next/navigation';

export default function ViewShell({ token, ownerName, children }) {
  const router = useRouter();

  const leave = async () => {
    await fetch('/api/view/session', { method: 'DELETE' });
    router.push(`/view/${token}`);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-edge bg-paper/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-ink text-paper flex items-center justify-center text-sm font-medium">₹</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{ownerName ? `${ownerName}'s debts` : 'Private view'}</p>
            <p className="text-[11px] text-ink-mute">View only</p>
          </div>
          <button type="button" onClick={leave} className="text-xs px-3 py-2 rounded-lg border border-edge hover:bg-paper-tint transition">
            Leave view
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
