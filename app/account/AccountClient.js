'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Shell from '@/components/Shell';
import { toast } from '@/components/Toast';

export default function AccountClient({ user }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
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

        <button
          onClick={handleLogout}
          disabled={loading}
          className="btn-danger w-full py-2.5 rounded-lg text-sm font-medium">
          {loading ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </Shell>
  );
}
