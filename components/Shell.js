'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Toaster from './Toast';

const NAV_ITEMS = [
  { key: 'home',    label: 'Home',    href: '/home',    icon: 'home' },
  { key: 'debts',   label: 'Debts',   href: '/debts',   icon: 'list' },
  { key: 'account', label: 'Account', href: '/account', icon: 'user' },
];

function NavIcon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'home')   return (<svg {...common}><path d="M3 9.5L12 3l9 6.5V21H3z"/><path d="M9 21V12h6v9"/></svg>);
  if (name === 'list')   return (<svg {...common}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>);
  if (name === 'user')   return (<svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>);
  if (name === 'plus')   return (<svg {...common}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
  return null;
}

export default function Shell({ children, user }) {
  const pathname = usePathname();

  const initials = (user?.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <Toaster />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-60 md:border-r md:border-edge md:bg-paper-tint md:px-3 md:py-5">
        <Link href="/home" className="flex items-center gap-2 px-3 pb-4 mb-2 border-b border-edge">
          <div className="w-9 h-9 rounded-xl bg-ink text-paper flex items-center justify-center font-medium">₹</div>
          <div className="font-medium">My Debt Tracker</div>
        </Link>

        {NAV_ITEMS.map(item => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.key} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition ${active ? 'bg-paper-card text-ink font-medium shadow-sm' : 'text-ink-soft hover:bg-paper-card/60'}`}>
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          );
        })}

        <Link href="/debts/new"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm text-ink-soft hover:bg-paper-card/60">
          <span className="w-[18px] h-[18px] flex items-center justify-center rounded-md bg-mint-50 text-mint-600 font-medium"><NavIcon name="plus" /></span>
          Add debt
        </Link>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-20 bg-paper-card border-b border-edge px-4 py-3 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-ink text-paper flex items-center justify-center font-medium text-xs">₹</div>
            <div className="text-sm font-medium">My Debt Tracker</div>
          </Link>
          <Link href="/debts/new"
            className="w-8 h-8 rounded-full bg-ink text-paper flex items-center justify-center">
            <NavIcon name="plus" />
          </Link>
        </header>

        {/* Desktop top bar */}
        <header className="hidden md:flex sticky top-0 z-20 bg-paper-card border-b border-edge px-6 h-14 items-center justify-end gap-3">
          <Link href="/debts/new"
            className="flex items-center gap-1.5 btn-primary py-2 px-4 rounded-full text-sm font-medium">
            + Add debt
          </Link>
          <Link href="/account"
            className="w-8 h-8 rounded-full bg-ember-50 text-ember-600 flex items-center justify-center text-xs font-medium hover:ring-2 hover:ring-ember-200">
            {initials}
          </Link>
        </header>

        <div className="flex-1 anim-fade pb-24 md:pb-0">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-paper-card border-t border-edge z-30 flex items-center px-2 py-1.5">
          {NAV_ITEMS.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.key} href={item.href}
                className={`flex-1 flex flex-col items-center gap-1 py-1.5 text-[11px] ${active ? 'text-ink font-medium' : 'text-ink-mute'}`}>
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${active ? 'bg-ink text-paper' : 'bg-transparent'}`}>
                  <NavIcon name={item.icon} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
