'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { WalletConnect } from './WalletConnect';
const CentryAssistantBubble = dynamic(() => import('./CentryAssistantBubble'), {
  ssr: false,
  loading: () => null,
});
import styles from './AppShell.module.css';
import surfaceStyles from './DesignSurface.module.css';

const NAV_ITEMS = [
  { href: '/app', label: 'Overview', icon: '⌂', group: 'overview' },
  { href: '/app/swap', label: 'Swap', icon: '⇄', group: 'use' },
  { href: '/app/markets', label: 'Markets', icon: '◈', group: 'use' },
  { href: '/app/gateway', label: 'Gateway', icon: '◉', group: 'use' },
  { href: '/app/rewards', label: 'Rewards', icon: '✦', group: 'earn', disabled: true },
  { href: '/app/governance', label: 'Governance', icon: '♢', group: 'earn', disabled: true },
  { href: '/app/agents', label: 'Agents', icon: '✧', group: 'automation' },
  { href: '/app/bridge', label: 'Bridge', icon: '↗', group: 'explore' },
  { href: '/app/portfolio', label: 'Portfolio', icon: '◐', group: 'explore' },
  { href: '/app/analytics', label: 'Analytics', icon: '⌁', group: 'explore' },
  { href: '/app/docs', label: 'Docs', icon: '□', group: 'docs' },
];

const NAV_GROUPS = [
  { key: 'overview', label: null },
  { key: 'use', label: 'Trade / Liquidity' },
  { key: 'earn', label: 'Earn' },
  { key: 'automation', label: 'Manage' },
  { key: 'explore', label: null },
  { key: 'docs', label: null },
];

export function AppShell({ children }) {
  const pathname = usePathname();
  const { address } = useAccount();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const active = pathname === '/app'
    ? '/app'
    : NAV_ITEMS.find((item) => item.href !== '/app' && pathname.startsWith(item.href))?.href || '/app';

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className={`app-shell ${surfaceStyles.surfaceRoot}`}>
      <button
        type="button"
        className="mobile-menu-button"
        aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen((open) => !open)}
      >
        <span className="mobile-menu-icon" aria-hidden="true" />
      </button>
      <aside className={`sidebar${mobileNavOpen ? ' mobile-nav-open' : ''}`}>
        <div className="brand"><span className="brand-mark">C</span><span>Centry</span></div>
        <nav className={`${styles.sideNav} side-nav`} aria-label="Primary navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.key} className={`nav-group nav-group-${group.key}`}>
              {group.label && (
                <div className="nav-group-label-row">
                  <div className="nav-group-label">{group.label}</div>
                </div>
              )}
              {NAV_ITEMS.filter((item) => item.group === group.key).map((item) => (
                item.disabled ? (
                  <div
                    key={item.href}
                    className={`nav-item nav-item-disabled ${active === item.href ? 'active' : ''}`}
                    aria-disabled="true"
                    title="Coming soon"
                  >
                    <span className="nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className="nav-item-status">Coming soon</span>
                  </div>
                ) : (
                  <Link key={item.href} href={item.href} className={`nav-item ${active === item.href ? 'active' : ''}`} aria-current={active === item.href ? 'page' : undefined} prefetch={false}>
                    <span className="nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                )
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

      <CentryAssistantBubble />
    </div>
  );
}