'use client';

import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { WalletConnect } from './WalletConnect';

const NAV_ITEMS = [
  { href: '/app', label: 'Overview', icon: '⌂' },
  { href: '/app/lending', label: 'Lending', icon: '◈' },
  { href: '/app/swap', label: 'Swap', icon: '⇄' },
  { href: '/app/pools', label: 'Pools', icon: '◒' },
  { href: '/app/bridge', label: 'Bridge', icon: '↗' },
  { href: '/app/portfolio', label: 'Portfolio', icon: '◐' },
  { href: '/app/governance', label: 'Governance', icon: '♢' },
  { href: '/app/rewards', label: 'Rewards', icon: '✦' },
  { href: '/app/analytics', label: 'Analytics', icon: '⌁' },
  { href: '/app/docs', label: 'Docs', icon: '□' },
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
        <nav className="side-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className={`nav-item ${active === item.href ? 'active' : ''}`}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer"><strong>Centry Protocol</strong><span>Arc-native liquidity</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>CENTRY</span><b>/</b>{NAV_ITEMS.find((item) => item.href === active)?.label}
          </div>
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
