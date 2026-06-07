'use client';

import { useEffect, useState } from 'react';

export function toast(message, type = 'success') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, type } }));
  }
}

export default function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const handle = (e) => {
      const { message, type } = e.detail;
      const id = Date.now() + Math.random();
      setItems(prev => [...prev, { id, message, type }]);
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== id)), 3200);
    };
    window.addEventListener('app:toast', handle);
    return () => window.removeEventListener('app:toast', handle);
  }, []);

  if (!items.length) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
      {items.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium anim-fade text-center min-w-[220px] max-w-xs ${
          t.type === 'success' ? 'bg-mint-600 text-paper' :
          t.type === 'error'   ? 'bg-danger text-paper' :
                                 'bg-ink text-paper'
        }`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
