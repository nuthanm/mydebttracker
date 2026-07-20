'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Toaster from './Toast';
import ConfirmDialog from './ConfirmDialog';

const NAV_ITEMS = [
  { key: 'home',     label: 'Home',              href: '/home',                     icon: 'home' },
  { key: 'debts',    label: 'Debts',             href: '/debts',                    icon: 'list' },
  { key: 'account',  label: 'Account',           href: '/account',                  icon: 'user' },
  { key: 'security', label: 'Security Activity', href: '/account/security-activity', icon: 'shield' },
];

const MOBILE_NAV = NAV_ITEMS.filter((item) => item.key !== 'security');
const NAV_ORDER_KEY = 'mdt-nav-order';
const SIDEBAR_COLLAPSED_KEY = 'mdt-sidebar-collapsed';

function loadNavOrder() {
  if (typeof window === 'undefined') return NAV_ITEMS;
  try {
    const saved = localStorage.getItem(NAV_ORDER_KEY);
    if (!saved) return NAV_ITEMS;
    const keys = JSON.parse(saved);
    if (!Array.isArray(keys)) return NAV_ITEMS;
    const map = new Map(NAV_ITEMS.map((item) => [item.key, item]));
    const ordered = keys.map((key) => map.get(key)).filter(Boolean);
    for (const item of NAV_ITEMS) {
      if (!keys.includes(item.key)) ordered.push(item);
    }
    return ordered;
  } catch {
    return NAV_ITEMS;
  }
}

function NavIcon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'home')   return (<svg {...common}><path d="M3 9.5L12 3l9 6.5V21H3z"/><path d="M9 21V12h6v9"/></svg>);
  if (name === 'list')   return (<svg {...common}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>);
  if (name === 'user')   return (<svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>);
  if (name === 'shield') return (<svg {...common}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9.5 12.5l1.8 1.8 3.7-3.8"/></svg>);
  if (name === 'plus')   return (<svg {...common}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
  if (name === 'grip')   return (<svg {...common} width={14} height={14}><circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>);
  if (name === 'chevron-left')  return (<svg {...common} width={16} height={16}><polyline points="15 18 9 12 15 6"/></svg>);
  if (name === 'chevron-right') return (<svg {...common} width={16} height={16}><polyline points="9 18 15 12 9 6"/></svg>);
  return null;
}

function DragHandle() {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        const row = e.currentTarget.closest('[data-nav-key]');
        if (!row) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.navKey);
        row.classList.add('opacity-40');
      }}
      onDragEnd={(e) => {
        e.currentTarget.closest('[data-nav-key]')?.classList.remove('opacity-40');
      }}
      className="shrink-0 cursor-grab active:cursor-grabbing text-ink-mute/50 hover:text-ink-mute opacity-0 group-hover/nav:opacity-100 transition-opacity"
      title="Drag to reorder"
      aria-label="Drag to reorder"
    >
      <NavIcon name="grip" />
    </span>
  );
}

export default function Shell({ children, user }) {
  const pathname = usePathname();
  const [navItems, setNavItems] = useState(NAV_ITEMS);
  const [collapsed, setCollapsed] = useState(false);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setNavItems(loadNavOrder());
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
    setHydrated(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  const reorderNav = useCallback((fromKey, toKey) => {
    if (fromKey === toKey) return;
    setNavItems((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((item) => item.key === fromKey);
      const toIdx = next.findIndex((item) => item.key === toKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(next.map((item) => item.key)));
      return next;
    });
  }, []);

  const initials = (user?.name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const sidebarWidth = collapsed ? 'md:w-[4.5rem]' : 'md:w-60';

  return (
    <div className="min-h-screen md:flex">
      <Toaster />
      <ConfirmDialog />

      {/* Desktop sidebar — sticky, collapsible, reorderable */}
      <aside
        className={`hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen md:shrink-0 md:border-r md:border-edge md:bg-paper-tint md:py-5 transition-[width] duration-200 overflow-hidden ${sidebarWidth}`}
      >
        <Link
          href="/home"
          className={`flex items-center gap-2 mb-2 border-b border-edge pb-4 ${collapsed ? 'justify-center px-2 mx-2' : 'px-3 mx-3'}`}
          title="My Debt Tracker"
        >
          <div className="w-9 h-9 shrink-0 rounded-xl bg-ink text-paper flex items-center justify-center font-medium">₹</div>
          {!collapsed && <div className="font-medium truncate">My Debt Tracker</div>}
        </Link>

        <nav className={`flex-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`} aria-label="Main navigation">
          {(hydrated ? navItems : NAV_ITEMS).map((item) => {
            const active = item.key === 'account'
              ? pathname === '/account'
              : pathname.startsWith(item.href);
            const isDragOver = dragOverKey === item.key;

            return (
              <div
                key={item.key}
                data-nav-key={item.key}
                onDragOver={(e) => {
                  if (collapsed) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverKey(item.key);
                }}
                onDragLeave={() => setDragOverKey(null)}
                onDrop={(e) => {
                  if (collapsed) return;
                  e.preventDefault();
                  setDragOverKey(null);
                  const fromKey = e.dataTransfer.getData('text/plain');
                  if (fromKey) reorderNav(fromKey, item.key);
                }}
                className={`group/nav mb-1 rounded-lg transition-colors ${isDragOver && !collapsed ? 'ring-2 ring-sky-600/30 bg-paper-card/60' : ''}`}
              >
                <div className={`flex items-center ${collapsed ? '' : 'gap-0.5'}`}>
                  {!collapsed && <DragHandle />}
                  <Link
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex flex-1 items-center rounded-lg text-sm transition ${
                      collapsed ? 'justify-center px-2 py-2.5' : 'gap-2 px-2 py-2.5'
                    } ${active ? 'bg-paper-card text-ink font-medium shadow-sm' : 'text-ink-soft hover:bg-paper-card/60'}`}
                  >
                    <span className={collapsed ? '' : 'shrink-0'}><NavIcon name={item.icon} /></span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </div>
              </div>
            );
          })}
        </nav>

        <div className={`shrink-0 space-y-2 pt-2 ${collapsed ? 'px-2' : 'px-3'}`}>
          <Link
            href="/debts/new"
            title={collapsed ? 'Add debt' : undefined}
            className={`flex items-center justify-center gap-1.5 bg-ink text-paper hover:bg-ink/90 py-2.5 rounded-full text-sm font-medium transition ${
              collapsed ? 'px-2' : 'px-4 mx-1'
            }`}
          >
            {collapsed ? <NavIcon name="plus" /> : '+ Add debt'}
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            className={`flex items-center justify-center w-full py-2 rounded-lg text-ink-mute hover:bg-paper-card/60 hover:text-ink-soft transition ${collapsed ? '' : 'gap-2 text-xs'}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <NavIcon name={collapsed ? 'chevron-right' : 'chevron-left'} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main content — scrolls independently */}
      <main className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-20 bg-paper-card border-b border-edge px-4 py-3 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-ink text-paper flex items-center justify-center font-medium text-xs">₹</div>
            <div className="text-sm font-medium">My Debt Tracker</div>
          </Link>
          <Link href="/debts/new"
            className="flex items-center gap-1.5 bg-ink text-paper hover:bg-ink/90 px-3 py-1.5 rounded-full text-xs font-medium">
            + Add debt
          </Link>
        </header>

        {/* Desktop top bar */}
        <header className="hidden md:flex sticky top-0 z-20 bg-paper-card border-b border-edge px-6 h-14 items-center justify-end shrink-0">
          <Link href="/account"
            className="w-8 h-8 rounded-full bg-ember-50 text-ember-600 flex items-center justify-center text-xs font-medium hover:ring-2 hover:ring-ember-200">
            {initials}
          </Link>
        </header>

        <div className="flex-1 anim-fade pb-24 md:pb-0 overflow-y-auto">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-paper-card border-t border-edge z-30 flex items-center px-2 py-1.5">
          {MOBILE_NAV.map(item => {
            const active = item.key === 'account'
              ? pathname === '/account' || pathname.startsWith('/account/')
              : pathname.startsWith(item.href);
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
