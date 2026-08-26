'use client';

import React, { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { Providers } from '../components/Providers';
import { WalletConnect } from '../components/WalletConnect';
import { useLendingPool } from '../hooks/useLendingPool';
import { useVeGovernance } from '../hooks/useVeGovernance';
import { ACTIVE_MARKETS, UPCOMING_MARKETS } from '../constants/markets';

const NAV_ITEMS = [
    { id: 'overview', label: 'Overview', icon: '⌂' },
    { id: 'lending', label: 'Lending', icon: '◈' },
    { id: 'portfolio', label: 'Portfolio', icon: '◒' },
    { id: 'governance', label: 'Governance', icon: '♢' },
    { id: 'rewards', label: 'Rewards', icon: '✦' },
    { id: 'analytics', label: 'Analytics', icon: '⌁' },
    { id: 'docs', label: 'Docs', icon: '□' },
];

function formatNumber(value, digits = 2) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
        return '0.00';
    }

    return number.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

function formatHealth(value) {
    if (value === '∞' || value === '—') {
        return value;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number.toFixed(2)
        : '—';
}

function errorText(error) {
    return (
        error?.shortMessage ||
        error?.message ||
        'Transaction failed. Check your wallet, network, allowance, and contract state.'
    );
}

function StatCard({ label, value, detail }) {
    return (
        <div className="metric">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    );
}

function AppShell({
    activeView,
    setActiveView,
    chainId,
    address,
    children,
}) {
    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    <span className="brand-mark">C</span>
                    <span>Centry</span>
                </div>

                <nav className="side-nav" aria-label="Primary navigation">
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                            onClick={() => setActiveView(item.id)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="network-card">
                    <span className="network-dot" />
                    <div>
                        <small>Network</small>
                        <strong>Arc Testnet</strong>
                    </div>
                    <span className="chain-id">{chainId || 5042002}</span>
                </div>

                <div className="sidebar-footer">
                    <strong>Centry Protocol</strong>
                    <span>Arc-native liquidity</span>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div className="breadcrumb">
                        <span>CENTRY</span>
                        <b>/</b>
                        {NAV_ITEMS.find((item) => item.id === activeView)?.label}
                    </div>
                    <WalletConnect />
                </header>

                <div className="page-view">
                    {children}
                </div>

                <footer className="page-footer">
                    <span>Centry Protocol</span>
                    <span>Arc Testnet</span>
                    <span>
                        {address
                            ? `${address.slice(0, 6)}…${address.slice(-4)}`
                            : 'Wallet not connected'}
                    </span>
                </footer>
            </main>
        </div>
    );
}

function Overview({
    lending,
    governance,
    connected,
    setActiveView,
}) {
    const liquidity = Number(lending.reserveData?.totalLiquidity || 0);
    const borrowed = Number(lending.reserveData?.totalBorrows || 0);
    const utilization = Number(lending.reserveData?.utilization || 0);

    return (
        <div className="page-stack">
            <section className="hero">
                <div className="hero-copy">
                    <div className="eyebrow">
                        <span />
                        Arc-native lending market
                    </div>
                    <h1>
                        Liquidity,
                        <br />
                        <em>built for Arc.</em>
                    </h1>
                    <p>
                        Centry is building an Arc-native money market for lending,
                        borrowing, and onchain risk management.
                    </p>
                    <div className="hero-actions">
                        <button
                            type="button"
                            className="primary-btn"
                            onClick={() => setActiveView('lending')}
                        >
                            Open lending
                            <span>→</span>
                        </button>
                        <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => setActiveView('portfolio')}
                        >
                            View portfolio
                        </button>
                    </div>
                </div>

                <div className="orbital-art" aria-hidden="true">
                    <div className="orbit orbit-a" />
                    <div className="orbit orbit-b" />
                    <div className="orbit orbit-c" />
                    <div className="usdc-orb">
                        <span>$</span>
                    </div>
                </div>
            </section>

            <section className="stats-grid">
                <StatCard
                    label="Active liquidity"
                    value={`${formatNumber(liquidity)} mUSDC`}
                    detail="Centry test reserve"
                />
                <StatCard
                    label="Borrowed"
                    value={`${formatNumber(borrowed)} mUSDC`}
                    detail="Outstanding debt"
                />
                <StatCard
                    label="Utilization"
                    value={`${formatNumber(utilization)}%`}
                    detail="Pool utilization"
                />
                <StatCard
                    label="Health factor"
                    value={connected ? formatHealth(lending.healthFactor) : 'Connect wallet'}
                    detail={connected ? 'Your account' : 'Per-account risk'}
                />
            </section>

            <section className="content-grid">
                <div className="panel panel-large">
                    <div className="panel-head">
                        <div>
                            <span className="section-kicker">MARKETS</span>
                            <h2>Available markets</h2>
                        </div>
                        <span className="live-badge">
                            <i />
                            Testnet
                        </span>
                    </div>

                    <div className="market-list">
                        {ACTIVE_MARKETS.map((market) => (
                            <button
                                key={market.id}
                                type="button"
                                className="market-list-item"
                                onClick={() => setActiveView('lending')}
                            >
                                <div className="asset">
                                    <span className="token usdc">$</span>
                                    <div>
                                        <strong>{market.symbol}</strong>
                                        <small>{market.name}</small>
                                    </div>
                                </div>
                                <div>
                                    <span>Status</span>
                                    <strong className="status-live">Live</strong>
                                </div>
                                <div>
                                    <span>Liquidity</span>
                                    <strong>{formatNumber(liquidity)} mUSDC</strong>
                                </div>
                                <span className="market-arrow">→</span>
                            </button>
                        ))}
                    </div>

                    <div className="upcoming-markets">
                        <div className="subsection-head">
                            <span className="section-kicker">COMING SOON</span>
                            <span>Assets are enabled only after address + oracle verification.</span>
                        </div>
                        <div className="chip-row">
                            {UPCOMING_MARKETS.map((market) => (
                                <div className="market-chip" key={market.id}>
                                    <strong>{market.symbol}</strong>
                                    <span>{market.status === 'coming-soon' ? 'Coming soon' : 'Disabled'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="panel">
                    <div className="panel-head">
                        <div>
                            <span className="section-kicker">GOVERNANCE</span>
                            <h2>veCENT</h2>
                        </div>
                    </div>
                    <p className="panel-copy">
                        Lock CENT to receive non-transferable voting power that decays over time.
                    </p>
                    <div className="governance-stats">
                        <StatCard
                            label="CENT balance"
                            value={formatNumber(governance.centBalance)}
                            detail="Wallet balance"
                        />
                        <StatCard
                            label="Voting power"
                            value={formatNumber(governance.votingPower)}
                            detail="Current veCENT"
                        />
                    </div>
                    <button
                        type="button"
                        className="primary-btn full-btn"
                        onClick={() => setActiveView('governance')}
                    >
                        Manage veCENT
                    </button>
                </div>
            </section>
        </div>
    );
}

function Lending({ lending, connected }) {
    const [action, setAction] = useState('supply');
    const [amount, setAmount] = useState('');
    const [notice, setNotice] = useState('');

    const busy = lending.isPending || lending.isConfirming;
    const allowance = Number(lending.usdcAllowance || 0);
    const numericAmount = Number(amount || 0);

    const needsApproval =
        connected &&
        ['supply', 'repay'].includes(action) &&
        numericAmount > allowance;

    const run = async () => {
        if (!connected || !amount || numericAmount <= 0 || busy) {
            return;
        }

        try {
            setNotice('');

            if (needsApproval) {
                await lending.approveUSDC(amount);
                setNotice(`Approved ${amount} mUSDC.`);
                return;
            }

            if (action === 'supply') {
                await lending.supply(amount);
            }

            if (action === 'withdraw') {
                await lending.withdraw(amount);
            }

            if (action === 'borrow') {
                await lending.borrow(amount);
            }

            if (action === 'repay') {
                await lending.repay(amount);
            }

            await lending.refetchAll();
            setAmount('');
            setNotice(`${action[0].toUpperCase()}${action.slice(1)} completed.`);
        } catch (error) {
            setNotice(errorText(error));
        }
    };

    const setMax = () => {
        if (action === 'withdraw') {
            setAmount(lending.supplyBalance || '0');
            return;
        }

        if (action === 'repay') {
            setAmount(lending.borrowBalance || '0');
            return;
        }

        setAmount(lending.usdcBalance || '0');
    };

    return (
        <div className="page-stack">
            <div className="section-header">
                <div>
                    <span className="section-kicker">LENDING</span>
                    <h1>mUSDC money market</h1>
                    <p>Full market controls for the Centry test reserve.</p>
                </div>
                <div className="test-badge">TEST ASSET · mUSDC</div>
            </div>

            <div className="warning-banner">
                <strong>Important:</strong>
                <span>
                    mUSDC is the Centry test token you deployed. It is not Arc-issued USDC and does not represent real value.
                </span>
            </div>

            <section className="stats-grid">
                <StatCard label="Wallet" value={`${formatNumber(lending.usdcBalance)} mUSDC`} detail="Available" />
                <StatCard label="Supplied" value={`${formatNumber(lending.supplyBalance)} mUSDC`} detail="Your collateral" />
                <StatCard label="Borrowed" value={`${formatNumber(lending.borrowBalance)} mUSDC`} detail="Your debt" />
                <StatCard label="Health factor" value={connected ? formatHealth(lending.healthFactor) : '—'} detail="Above 1.00 is healthier" />
            </section>

            <section className="workspace-grid">
                <div className="panel workspace-panel">
                    <div className="action-tabs">
                        {['supply', 'withdraw', 'borrow', 'repay'].map((item) => (
                            <button
                                key={item}
                                type="button"
                                className={action === item ? 'active' : ''}
                                onClick={() => setAction(item)}
                            >
                                {item[0].toUpperCase() + item.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div className="form-card">
                        <span className="section-kicker">{action.toUpperCase()}</span>
                        <h2>{action[0].toUpperCase() + action.slice(1)} mUSDC</h2>
                        <p>
                            Enter an amount and Centry will use the deployed lending-pool contract.
                        </p>

                        <label className="field-label" htmlFor="market-amount">
                            Amount
                        </label>

                        <div className="amount-input-wrap">
                            <input
                                id="market-amount"
                                type="number"
                                min="0"
                                step="0.000001"
                                placeholder="0.00"
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                            />
                            <span>mUSDC</span>
                        </div>

                        <div className="form-meta">
                            <span>Wallet: {formatNumber(lending.usdcBalance)} mUSDC</span>
                            <button type="button" onClick={setMax}>Max</button>
                        </div>

                        {!connected ? (
                            <div className="connect-prompt">
                                Connect your wallet above to interact with the deployed pool.
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="primary-btn full-btn large-btn"
                                disabled={busy || !amount}
                                onClick={run}
                            >
                                {busy
                                    ? 'Waiting for confirmation…'
                                    : needsApproval
                                        ? `Approve mUSDC for ${action}`
                                        : `${action[0].toUpperCase()}${action.slice(1)} mUSDC`}
                            </button>
                        )}

                        {notice && <div className="notice">{notice}</div>}
                    </div>
                </div>

                <div className="panel position-panel">
                    <div className="panel-head">
                        <div>
                            <span className="section-kicker">POSITION</span>
                            <h2>Your risk</h2>
                        </div>
                    </div>
                    <div className="position-list">
                        <div className="position-row">
                            <span>Supplied</span>
                            <strong>{formatNumber(lending.supplyBalance)} mUSDC</strong>
                        </div>
                        <div className="position-row">
                            <span>Borrowed</span>
                            <strong>{formatNumber(lending.borrowBalance)} mUSDC</strong>
                        </div>
                        <div className="position-row">
                            <span>Borrow power</span>
                            <strong>{formatNumber(lending.borrowPower)} USD</strong>
                        </div>
                        <div className="position-row">
                            <span>Health factor</span>
                            <strong>{connected ? formatHealth(lending.healthFactor) : '—'}</strong>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

function Portfolio({ lending, connected }) {
    return (
        <div className="page-stack">
            <div className="section-header">
                <div>
                    <span className="section-kicker">PORTFOLIO</span>
                    <h1>Your position</h1>
                    <p>Collateral, debt, borrowing capacity, and account health.</p>
                </div>
            </div>

            {!connected && (
                <div className="connect-prompt large-prompt">
                    Connect your wallet to load your onchain portfolio.
                </div>
            )}

            <section className="portfolio-grid">
                <StatCard label="Supplied" value={`${formatNumber(lending.supplyBalance)} mUSDC`} detail="Collateral" />
                <StatCard label="Borrowed" value={`${formatNumber(lending.borrowBalance)} mUSDC`} detail="Debt" />
                <StatCard label="Borrow power" value={`${formatNumber(lending.borrowPower)} USD`} detail="Maximum debt value" />
                <StatCard label="Health factor" value={connected ? formatHealth(lending.healthFactor) : '—'} detail="Liquidation boundary" />
            </section>

            <div className="panel">
                <div className="panel-head">
                    <div>
                        <span className="section-kicker">RISK</span>
                        <h2>Position health</h2>
                    </div>
                </div>
                <div className="risk-card">
                    <div className="risk-value">
                        <span>Health factor</span>
                        <strong>{connected ? formatHealth(lending.healthFactor) : '—'}</strong>
                    </div>
                    <div className="risk-track">
                        <span />
                    </div>
                    <p>
                        Centry blocks new borrowing when your debt exceeds borrow power and can liquidate unhealthy positions.
                    </p>
                </div>
            </div>
        </div>
    );
}

function Governance({ governance, connected }) {
    const [amount, setAmount] = useState('');
    const [weeks, setWeeks] = useState('52');
    const [notice, setNotice] = useState('');

    const busy = governance.isPending || governance.isConfirming;
    const needsApproval =
        connected && Number(amount || 0) > Number(governance.centAllowance || 0);

    const submit = async () => {
        if (!connected || !amount || Number(amount) <= 0 || busy) {
            return;
        }

        try {
            setNotice('');

            if (needsApproval) {
                await governance.approveCENT(amount);
                setNotice(`Approved ${amount} CENT.`);
                return;
            }

            await governance.createLock(amount, weeks);
            await governance.refetchAll();
            setAmount('');
            setNotice('CENT lock created.');
        } catch (error) {
            setNotice(errorText(error));
        }
    };

    return (
        <div className="page-stack">
            <div className="section-header">
                <div>
                    <span className="section-kicker">GOVERNANCE</span>
                    <h1>veCENT</h1>
                    <p>Lock CENT to create your governance position.</p>
                </div>
            </div>

            <section className="governance-hero-grid">
                <div className="panel governance-hero-card">
                    <span className="section-kicker">CURRENT POSITION</span>
                    <div className="big-number">{formatNumber(governance.votingPower)}</div>
                    <span className="muted-label">Voting power</span>
                    <div className="governance-stat-line">
                        <span>CENT balance</span>
                        <strong>{formatNumber(governance.centBalance)}</strong>
                    </div>
                    <div className="governance-stat-line">
                        <span>Locked CENT</span>
                        <strong>{formatNumber(governance.lockedAmount)}</strong>
                    </div>
                    <div className="governance-stat-line">
                        <span>veNFTs</span>
                        <strong>{governance.veBalance}</strong>
                    </div>
                    <div className="governance-stat-line">
                        <span>Lock end</span>
                        <strong>
                            {governance.lockEnd
                                ? governance.lockEnd.toLocaleDateString()
                                : '—'}
                        </strong>
                    </div>
                </div>

                <div className="panel">
                    <span className="section-kicker">CREATE LOCK</span>
                    <h2>Lock CENT</h2>
                    <p className="panel-copy">
                        The current MVP supports one lock per wallet with weekly lock expiry.
                    </p>

                    <label className="field-label" htmlFor="cent-amount">
                        CENT amount
                    </label>
                    <div className="amount-input-wrap">
                        <input
                            id="cent-amount"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                        />
                        <span>CENT</span>
                    </div>

                    <label className="field-label" htmlFor="lock-weeks">
                        Lock duration
                    </label>
                    <select
                        id="lock-weeks"
                        value={weeks}
                        onChange={(event) => setWeeks(event.target.value)}
                    >
                        <option value="4">4 weeks</option>
                        <option value="13">13 weeks</option>
                        <option value="26">26 weeks</option>
                        <option value="52">52 weeks</option>
                    </select>

                    {!connected ? (
                        <div className="connect-prompt">
                            Connect your wallet to manage veCENT.
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="primary-btn full-btn large-btn"
                            disabled={busy || !amount}
                            onClick={submit}
                        >
                            {busy
                                ? 'Waiting for confirmation…'
                                : needsApproval
                                    ? 'Approve CENT'
                                    : `Lock CENT for ${weeks} weeks`}
                        </button>
                    )}

                    {notice && <div className="notice">{notice}</div>}
                </div>
            </section>
        </div>
    );
}

function Rewards() {
    return (
        <div className="page-stack">
            <div className="section-header">
                <div>
                    <span className="section-kicker">REWARDS</span>
                    <h1>Protocol rewards</h1>
                    <p>Reward infrastructure is deployed, but distribution stays disabled until an eligible epoch is configured.</p>
                </div>
            </div>

            <div className="feature-grid">
                <div className="panel feature-card">
                    <span className="section-kicker">REVENUE</span>
                    <h2>Revenue distributor</h2>
                    <p>Claims use Merkle proofs and the deployed revenue distributor contract.</p>
                </div>
                <div className="panel feature-card">
                    <span className="section-kicker">INCENTIVES</span>
                    <h2>Liquidity incentives</h2>
                    <p>Future market incentives can be introduced without changing the lending pool core.</p>
                </div>
                <div className="panel feature-card">
                    <span className="section-kicker">GOVERNANCE</span>
                    <h2>veCENT utility</h2>
                    <p>Governance and reward mechanics can expand as Centry adds additional markets.</p>
                </div>
            </div>
        </div>
    );
}

function Analytics({ lending }) {
    return (
        <div className="page-stack">
            <div className="section-header">
                <div>
                    <span className="section-kicker">ANALYTICS</span>
                    <h1>Market analytics</h1>
                    <p>Current figures read directly from the Centry lending pool.</p>
                </div>
            </div>

            <section className="stats-grid">
                <StatCard label="Liquidity" value={`${formatNumber(lending.reserveData?.totalLiquidity)} mUSDC`} detail="Current supply" />
                <StatCard label="Borrowed" value={`${formatNumber(lending.reserveData?.totalBorrows)} mUSDC`} detail="Current debt" />
                <StatCard label="Utilization" value={`${formatNumber(lending.reserveData?.utilization)}%`} detail="Current utilization" />
                <StatCard label="Enabled market" value="mUSDC" detail="Test reserve" />
            </section>

            <div className="panel empty-chart-panel">
                <span className="section-kicker">HISTORY</span>
                <h2>Historical charts</h2>
                <p>
                    Historical graphs will be populated from indexed onchain events once the market has enough history. The dashboard will not fabricate metrics.
                </p>
            </div>
        </div>
    );
}

function Docs() {
    return (
        <div className="page-stack">
            <div className="section-header">
                <div>
                    <span className="section-kicker">DOCS</span>
                    <h1>Centry documentation</h1>
                    <p>Current testnet architecture and user flows.</p>
                </div>
            </div>

            <div className="docs-grid">
                {[
                    ['Lending', ['Supply mUSDC', 'Borrow against collateral', 'Repay debt', 'Withdraw collateral']],
                    ['Governance', ['CENT token', 'veCENT locks', 'Voting power decay', 'Revenue distribution']],
                    ['Markets', ['mUSDC test market', 'Future USDC', 'Future EURC', 'Future USYC']],
                    ['Security', ['Oracle validation', 'Reserve caps', 'Pause controls', 'Independent audit before production']],
                ].map(([title, items]) => (
                    <div className="panel doc-card" key={title}>
                        <span className="section-kicker">{title.toUpperCase()}</span>
                        <h2>{title}</h2>
                        <div className="doc-list">
                            {items.map((item) => (
                                <div className="doc-item" key={item}>
                                    <span>→</span>
                                    <strong>{item}</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Dashboard() {
    const { address, isConnected } = useAccount();
    const chainId = useChainId();
    const lending = useLendingPool();
    const governance = useVeGovernance();
    const [activeView, setActiveView] = useState('overview');

    const content = useMemo(() => {
        if (activeView === 'lending') {
            return <Lending lending={lending} connected={isConnected} />;
        }

        if (activeView === 'portfolio') {
            return <Portfolio lending={lending} connected={isConnected} />;
        }

        if (activeView === 'governance') {
            return <Governance governance={governance} connected={isConnected} />;
        }

        if (activeView === 'rewards') {
            return <Rewards />;
        }

        if (activeView === 'analytics') {
            return <Analytics lending={lending} />;
        }

        if (activeView === 'docs') {
            return <Docs />;
        }

        return (
            <Overview
                lending={lending}
                governance={governance}
                connected={isConnected}
                setActiveView={setActiveView}
            />
        );
    }, [
        activeView,
        lending,
        governance,
        isConnected,
    ]);

    return (
        <AppShell
            activeView={activeView}
            setActiveView={setActiveView}
            chainId={chainId}
            address={address}
        >
            {content}
        </AppShell>
    );
}

export default function Page() {
    return (
        <Providers>
            <Dashboard />
        </Providers>
    );
}
