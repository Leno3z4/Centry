'use client';

import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { WalletConnect } from './WalletConnect';

const NAV_ITEMS = [
  { href: '/app', label: 'Overview', icon: '⌂', group: 'overview' },
  { href: '/app/swap', label: 'Swap', icon: '⇄', group: 'product' },
  { href: '/app/markets', label: 'Markets', icon: '◈', group: 'product' },
  { href: '/app/rewards', label: 'Rewards', icon: '✦', group: 'product' },
  { href: '/app/governance', label: 'Governance', icon: '♢', group: 'product' },
  { href: '/app/pools', label: 'Pools', icon: '◒', group: 'explore' },
  { href: '/app/bridge', label: 'Bridge', icon: '↗', group: 'explore' },
  { href: '/app/portfolio', label: 'Portfolio', icon: '◐', group: 'explore' },
  { href: '/app/analytics', label: 'Analytics', icon: '⌁', group: 'explore' },
  { href: '/app/docs', label: 'Docs', icon: '□', group: 'docs' },
];

const NAV_GROUPS = [
  { key: 'overview', label: null },
  { key: 'product', label: 'Main' },
  { key: 'explore', label: 'Explore' },
  { key: 'docs', label: null },
];

export function AppShell({ children }) {
  const pathname = usePathname();
  const { address } = useAccount();
  const active = pathname === '/app'
    ? '/app'
    : NAV_ITEMS.find((item) => item.href !== '/app' && pathname.startsWith(item.href))?.href || '/app';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">C</span><span>Centry</span></div>
        <nav className="side-nav" aria-label="Primary navigation" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'thin' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.key} className={`nav-group nav-group-${group.key}`}>
              {group.label && <div className="nav-group-label">{group.label}</div>}
              {NAV_ITEMS.filter((item) => item.group === group.key).map((item) => (
                <a key={item.href} href={item.href} className={`nav-item ${active === item.href ? 'active' : ''}`} aria-current={active === item.href ? 'page' : undefined}>
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer"><strong>Centry Protocol</strong><span>Arc-native liquidity</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>CENTRY</span><b>/</b>{NAV_ITEMS.find((item) => item.href === active)?.label}</div>
          <WalletConnect />
        </header>
        <div className="page-view">{children}</div>
        <footer className="page-footer">
          <span>Centry Protocol</span>
          <span>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Wallet not connected'}</span>
        </footer>
      </main>
    </div>
  );
}