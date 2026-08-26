'use client';

import React, { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { Providers } from '../components/Providers';
import { WalletConnect } from '../components/WalletConnect';
import { useLendingPool } from '../hooks/useLendingPool';
import { useVeGovernance } from '../hooks/useVeGovernance';

const NAV_ITEMS = [
    {
        id: 'overview',
        label: 'Overview',
        icon: '⌂',
    },
    {
        id: 'lending',
        label: 'Lending',
        icon: '◈',
    },
    {
        id: 'governance',
        label: 'Governance',
        icon: '♢',
    },
    {
        id: 'rewards',
        label: 'Rewards',
        icon: '✦',
    },
    {
        id: 'analytics',
        label: 'Analytics',
        icon: '⌁',
    },
    {
        id: 'docs',
        label: 'Docs',
        icon: '□',
    },
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

function formatHealthFactor(value) {
    if (value === '∞') {
        return '∞';
    }

    if (value === '—') {
        return '—';
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return '—';
    }

    return number.toFixed(2);
}

function txMessage(error) {
    return (
        error?.shortMessage
        || error?.message
        || 'Transaction failed. Check the wallet, network, allowance, and contract state.'
    );
}

function Metric({
    label,
    value,
    detail,
}) {
    return (
        <div className="metric">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    );
}

function MetricSmall({
    label,
    value,
}) {
    return (
        <div>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function ActionButton({
    children,
    disabled,
    onClick,
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function Dashboard() {
    const {
        address,
        isConnected,
    } = useAccount();

    const chainId = useChainId();

    const {
        reserveData,
        supplyBalance,
        borrowBalance,
        healthFactor,
        usdcBalance,
        usdcAllowance,
        approveUSDC,
        supply,
        withdraw,
        borrow,
        repay,
        refetchAll: refetchLending,
        isPending: lendingPending,
        isConfirming: lendingConfirming,
        error: lendingError,
    } = useLendingPool();

    const {
        veBalance,
        tokenId,
        votingPower,
        lockedAmount,
        lockEnd,
        centBalance,
        centAllowance,
        approveCENT,
        createLock,
        increaseLock,
        extendLock,
        refetchAll: refetchGovernance,
        isPending: governancePending,
        isConfirming: governanceConfirming,
        error: governanceError,
    } = useVeGovernance();

    const [activeView, setActiveView] = useState('overview');
    const [supplyAmount, setSupplyAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [borrowAmount, setBorrowAmount] = useState('');
    const [repayAmount, setRepayAmount] = useState('');
    const [lockAmount, setLockAmount] = useState('');
    const [lockWeeks, setLockWeeks] = useState('52');
    const [notice, setNotice] = useState('');

    const busy = lendingPending || lendingConfirming || governancePending || governanceConfirming;

    const liquidity = Number(reserveData?.totalLiquidity || 0);
    const borrowed = Number(reserveData?.totalBorrows || 0);
    const utilization = Number(reserveData?.utilization || 0);
    const userSupply = Number(supplyBalance || 0);
    const userBorrow = Number(borrowBalance || 0);
    const health = formatHealthFactor(healthFactor);

    const supplyNeedsApproval = useMemo(() => {
        if (!supplyAmount) {
            return false;
        }

        return Number(supplyAmount) > Number(usdcAllowance || 0);
    }, [supplyAmount, usdcAllowance]);

    const lockNeedsApproval = useMemo(() => {
        if (!lockAmount) {
            return false;
        }

        return Number(lockAmount) > Number(centAllowance || 0);
    }, [lockAmount, centAllowance]);

    const resetNoticeLater = () => {
        window.setTimeout(() => {
            setNotice('');
        }, 7000);
    };

    const runLendingAction = async (action, successText) => {
        try {
            setNotice('');
            await action();
            await refetchLending();
            setNotice(successText);
            resetNoticeLater();
        } catch (error) {
            setNotice(txMessage(error));
            resetNoticeLater();
        }
    };

    const runGovernanceAction = async (action, successText) => {
        try {
            setNotice('');
            await action();
            await refetchGovernance();
            setNotice(successText);
            resetNoticeLater();
        } catch (error) {
            setNotice(txMessage(error));
            resetNoticeLater();
        }
    };

    const handleSupply = async () => {
        if (!supplyAmount || Number(supplyAmount) <= 0) {
            return;
        }

        if (supplyNeedsApproval) {
            await runLendingAction(
                () => approveUSDC(supplyAmount),
                `Approved ${supplyAmount} USDC for Centry.`,
            );
            return;
        }

        await runLendingAction(
            () => supply(supplyAmount),
            `Supplied ${supplyAmount} USDC to Centry.`,
        );
        setSupplyAmount('');
    };

    const handleWithdraw = async () => {
        if (!withdrawAmount || Number(withdrawAmount) <= 0) {
            return;
        }

        await runLendingAction(
            () => withdraw(withdrawAmount),
            `Withdrew ${withdrawAmount} USDC from Centry.`,
        );
        setWithdrawAmount('');
    };

    const handleBorrow = async () => {
        if (!borrowAmount || Number(borrowAmount) <= 0) {
            return;
        }

        await runLendingAction(
            () => borrow(borrowAmount),
            `Borrowed ${borrowAmount} USDC from Centry.`,
        );
        setBorrowAmount('');
    };

    const handleRepay = async () => {
        if (!repayAmount || Number(repayAmount) <= 0) {
            return;
        }

        await runLendingAction(
            () => repay(repayAmount),
            `Repaid ${repayAmount} USDC to Centry.`,
        );
        setRepayAmount('');
    };

    const handleLock = async () => {
        if (!lockAmount || Number(lockAmount) <= 0) {
            return;
        }

        if (lockNeedsApproval) {
            await runGovernanceAction(
                () => approveCENT(lockAmount),
                `Approved ${lockAmount} CENT for veCENT.`,
            );
            return;
        }

        await runGovernanceAction(
            () => createLock(lockAmount, lockWeeks),
            `Locked ${lockAmount} CENT for ${lockWeeks} weeks.`,
        );
        setLockAmount('');
    };

    const handleRefresh = async () => {
        try {
            await Promise.all([
                refetchLending(),
                refetchGovernance(),
            ]);
            setNotice('Dashboard refreshed from Arc.');
            resetNoticeLater();
        } catch (error) {
            setNotice(txMessage(error));
            resetNoticeLater();
        }
    };

    const renderOverview = () => (
        <>
            <section className="hero">
                <div className="hero-copy">
                    <div className="eyebrow">
                        <span />
                        Arc-native lending market
                    </div>
                    <h1>
                        USDC liquidity
                        <br />
                        <em>built for Arc.</em>
                    </h1>
                    <p>
                        Supply USDC, borrow against your collateral, and manage risk directly through Centry&apos;s onchain money market.
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
                            onClick={() => setActiveView('governance')}
                        >
                            Open governance
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
                <Metric
                    label="USDC Liquidity"
                    value={`${formatNumber(liquidity)} USDC`}
                    detail="Reserve liquidity"
                />
                <Metric
                    label="USDC Borrowed"
                    value={`${formatNumber(borrowed)} USDC`}
                    detail="Outstanding debt"
                />
                <Metric
                    label="Utilization"
                    value={`${formatNumber(utilization)}%`}
                    detail="Borrowed / available"
                />
                <Metric
                    label="Health factor"
                    value={isConnected ? health : 'Connect wallet'}
                    detail="Per-account risk"
                />
            </section>

            <section className="content-grid">
                <div className="panel market-panel">
                    <div className="panel-head">
                        <div>
                            <span className="section-kicker">MARKET</span>
                            <h2>USDC Lending Pool</h2>
                        </div>
                        <span className="live-badge">
                            <i />
                            Live onchain
                        </span>
                    </div>
                    <div className="market-row market-head">
                        <span>Asset</span>
                        <span>Liquidity</span>
                        <span>Borrowed</span>
                        <span>Utilization</span>
                        <span />
                    </div>
                    <div className="market-row">
                        <div className="asset">
                            <span className="token usdc">$</span>
                            <div>
                                <strong>USDC</strong>
                                <small>Arc-native gas asset</small>
                            </div>
                        </div>
                        <strong>{formatNumber(liquidity)}</strong>
                        <strong>{formatNumber(borrowed)}</strong>
                        <strong>{formatNumber(utilization)}%</strong>
                        <button
                            type="button"
                            className="row-btn"
                            onClick={() => setActiveView('lending')}
                        >
                            Manage
                        </button>
                    </div>
                    <div className="rate-strip">
                        <span>Risk model</span>
                        <strong>Oracle-protected</strong>
                        <span>•</span>
                        <span>Variable interest</span>
                        <strong>Onchain</strong>
                    </div>
                </div>

                <div className="panel governance-panel">
                    <div className="panel-head">
                        <div>
                            <span className="section-kicker">GOVERNANCE</span>
                            <h2>veCENT</h2>
                        </div>
                        <span className="live-badge">
                            <i />
                            {isConnected ? 'Wallet linked' : 'Connect wallet'}
                        </span>
                    </div>
                    <p className="governance-copy">
                        Lock CENT to receive a non-transferable veCENT position with time-decaying voting power.
                    </p>
                    <div className="governance-stats">
                        <MetricSmall
                            label="CENT balance"
                            value={formatNumber(centBalance)}
                        />
                        <MetricSmall
                            label="veNFTs"
                            value={formatNumber(veBalance, 0)}
                        />
                    </div>
                    <button
                        type="button"
                        className="primary-btn"
                        onClick={() => setActiveView('governance')}
                    >
                        Manage veCENT
                    </button>
                </div>
            </section>
        </>
    );

    const renderLending = () => (
        <section className="content-grid single-column-view">
            <div className="panel market-panel">
                <div className="panel-head">
                    <div>
                        <span className="section-kicker">LENDING</span>
                        <h2>Manage your USDC position</h2>
                    </div>
                    <span className="live-badge">
                        <i />
                        Arc Testnet
                    </span>
                </div>

                <div className="stats-grid inner-stats">
                    <Metric
                        label="Wallet USDC"
                        value={formatNumber(usdcBalance)}
                        detail="Available to supply / approve"
                    />
                    <Metric
                        label="Supplied"
                        value={formatNumber(userSupply)}
                        detail="Current collateral balance"
                    />
                    <Metric
                        label="Borrowed"
                        value={formatNumber(userBorrow)}
                        detail="Current debt balance"
                    />
                    <Metric
                        label="Health factor"
                        value={health}
                        detail="Below 1.00 is liquidatable"
                    />
                </div>

                <div className="market-actions lending-actions-grid">
                    <div className="action-card">
                        <h3>Supply USDC</h3>
                        <p>
                            Wallet balance: {formatNumber(usdcBalance)} USDC
                        </p>
                        <input
                            type="number"
                            min="0"
                            step="0.000001"
                            placeholder="Amount"
                            value={supplyAmount}
                            onChange={(event) => setSupplyAmount(event.target.value)}
                        />
                        <div className="action-buttons">
                            <ActionButton
                                disabled={
                                    busy
                                    || !isConnected
                                    || !supplyAmount
                                }
                                onClick={handleSupply}
                            >
                                {supplyNeedsApproval ? 'Approve USDC' : 'Supply USDC'}
                            </ActionButton>
                        </div>
                    </div>

                    <div className="action-card">
                        <h3>Withdraw USDC</h3>
                        <p>
                            Supplied: {formatNumber(userSupply)} USDC
                        </p>
                        <input
                            type="number"
                            min="0"
                            step="0.000001"
                            placeholder="Amount"
                            value={withdrawAmount}
                            onChange={(event) => setWithdrawAmount(event.target.value)}
                        />
                        <div className="action-buttons">
                            <ActionButton
                                disabled={
                                    busy
                                    || !isConnected
                                    || !withdrawAmount
                                }
                                onClick={handleWithdraw}
                            >
                                Withdraw USDC
                            </ActionButton>
                        </div>
                    </div>

                    <div className="action-card">
                        <h3>Borrow USDC</h3>
                        <p>
                            Health factor: {health}
                        </p>
                        <input
                            type="number"
                            min="0"
                            step="0.000001"
                            placeholder="Amount"
                            value={borrowAmount}
                            onChange={(event) => setBorrowAmount(event.target.value)}
                        />
                        <div className="action-buttons">
                            <ActionButton
                                disabled={
                                    busy
                                    || !isConnected
                                    || !borrowAmount
                                }
                                onClick={handleBorrow}
                            >
                                Borrow USDC
                            </ActionButton>
                        </div>
                    </div>

                    <div className="action-card">
                        <h3>Repay USDC</h3>
                        <p>
                            Debt: {formatNumber(userBorrow)} USDC
                        </p>
                        <input
                            type="number"
                            min="0"
                            step="0.000001"
                            placeholder="Amount"
                            value={repayAmount}
                            onChange={(event) => setRepayAmount(event.target.value)}
                        />
                        <div className="action-buttons">
                            <ActionButton
                                disabled={
                                    busy
                                    || !isConnected
                                    || !repayAmount
                                }
                                onClick={handleRepay}
                            >
                                Repay USDC
                            </ActionButton>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );

    const renderGovernance = () => (
        <section className="content-grid single-column-view">
            <div className="panel governance-panel">
                <div className="panel-head">
                    <div>
                        <span className="section-kicker">GOVERNANCE</span>
                        <h2>veCENT</h2>
                    </div>
                    <span className="live-badge">
                        <i />
                        {isConnected ? 'Wallet linked' : 'Connect wallet'}
                    </span>
                </div>

                <p className="governance-copy">
                    Lock CENT to create a non-transferable veCENT position. Voting power decreases as the lock approaches expiry.
                </p>

                <div className="stats-grid inner-stats">
                    <Metric
                        label="CENT balance"
                        value={formatNumber(centBalance)}
                        detail="Wallet balance"
                    />
                    <Metric
                        label="Locked CENT"
                        value={formatNumber(lockedAmount)}
                        detail="Current lock"
                    />
                    <Metric
                        label="Voting power"
                        value={formatNumber(votingPower)}
                        detail="Current veCENT power"
                    />
                    <Metric
                        label="veNFT"
                        value={tokenId ? `#${tokenId}` : 'None'}
                        detail={lockEnd ? `Unlocks ${lockEnd.toLocaleDateString()}` : 'No active lock'}
                    />
                </div>

                <div className="market-actions">
                    <div className="action-card">
                        <h3>Create lock</h3>
                        <p>
                            Allowance: {formatNumber(centAllowance)} CENT
                        </p>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="CENT amount"
                            value={lockAmount}
                            onChange={(event) => setLockAmount(event.target.value)}
                        />
                        <select
                            value={lockWeeks}
                            onChange={(event) => setLockWeeks(event.target.value)}
                        >
                            <option value="1">1 week</option>
                            <option value="26">26 weeks</option>
                            <option value="52">52 weeks</option>
                            <option value="104">104 weeks</option>
                        </select>
                        <div className="action-buttons">
                            <ActionButton
                                disabled={
                                    busy
                                    || !isConnected
                                    || !lockAmount
                                }
                                onClick={handleLock}
                            >
                                {lockNeedsApproval ? 'Approve CENT' : 'Lock CENT'}
                            </ActionButton>
                        </div>
                    </div>

                    <div className="action-card">
                        <h3>Existing lock</h3>
                        <p>
                            Current position: {tokenId ? `veCENT #${tokenId}` : 'None'}
                        </p>
                        <div className="action-buttons">
                            <ActionButton
                                disabled={!isConnected || !lockedAmount || busy}
                                onClick={() => runGovernanceAction(
                                    () => increaseLock(lockedAmount),
                                    'Requested an increase to the existing lock.',
                                )}
                            >
                                Increase by locked amount
                            </ActionButton>
                            <ActionButton
                                disabled={!isConnected || !lockEnd || busy}
                                onClick={() => runGovernanceAction(
                                    () => extendLock(52),
                                    'Extended the existing lock by 52 weeks.',
                                )}
                            >
                                Extend 52 weeks
                            </ActionButton>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );

    const renderRewards = () => (
        <section className="content-grid single-column-view">
            <div className="panel feature-panel">
                <span className="section-kicker">REWARDS</span>
                <h2>Revenue distribution</h2>
                <p>
                    The current MVP has a dedicated revenue distributor, but it does not fabricate reward balances. When a real Merkle epoch is published, claims will be handled from that distributor using the published proof.
                </p>
                <div className="rate-strip">
                    <span>Distributor</span>
                    <strong>Configured</strong>
                    <span>•</span>
                    <span>Asset</span>
                    <strong>ERC-20</strong>
                </div>
                <p className="notice">
                    Reward claims are intentionally disabled here until an actual reward epoch and Merkle proof are available.
                </p>
            </div>
        </section>
    );

    const renderAnalytics = () => (
        <section className="content-grid single-column-view">
            <div className="panel market-panel">
                <div className="panel-head">
                    <div>
                        <span className="section-kicker">ANALYTICS</span>
                        <h2>Live market metrics</h2>
                    </div>
                    <button
                        type="button"
                        className="row-btn"
                        onClick={handleRefresh}
                    >
                        Refresh
                    </button>
                </div>
                <div className="stats-grid inner-stats">
                    <Metric
                        label="Total supply"
                        value={`${formatNumber(liquidity)} USDC`}
                        detail="Read from LendingPool"
                    />
                    <Metric
                        label="Total borrow"
                        value={`${formatNumber(borrowed)} USDC`}
                        detail="Read from LendingPool"
                    />
                    <Metric
                        label="Utilization"
                        value={`${formatNumber(utilization)}%`}
                        detail="Onchain reserve ratio"
                    />
                    <Metric
                        label="Your health factor"
                        value={health}
                        detail="Account risk metric"
                    />
                </div>
                <div className="rate-strip">
                    <span>Connected wallet</span>
                    <strong>
                        {isConnected
                            ? `${address.slice(0, 6)}…${address.slice(-4)}`
                            : 'Not connected'}
                    </strong>
                    <span>•</span>
                    <span>Chain ID</span>
                    <strong>{chainId || '—'}</strong>
                </div>
            </div>
        </section>
    );

    const renderDocs = () => (
        <section className="content-grid single-column-view">
            <div className="panel feature-panel">
                <span className="section-kicker">DOCS</span>
                <h2>Centry on Arc Testnet</h2>
                <p>
                    Centry is the Arc-native lending MVP in this repository. The current deployment uses the tested LendingPool, oracle adapter, immutable interest-rate strategy, CENT, veCENT, and revenue distributor.
                </p>
                <div className="rate-strip">
                    <span>Network</span>
                    <strong>Arc Testnet</strong>
                    <span>•</span>
                    <span>Chain ID</span>
                    <strong>{chainId || 5042002}</strong>
                </div>
                <a
                    href="https://github.com/Leno3z4/Centry/tree/main/contracts"
                    target="_blank"
                    rel="noreferrer"
                >
                    Open contract source →
                </a>
            </div>
        </section>
    );

    const renderView = () => {
        switch (activeView) {
            case 'lending':
                return renderLending();
            case 'governance':
                return renderGovernance();
            case 'rewards':
                return renderRewards();
            case 'analytics':
                return renderAnalytics();
            case 'docs':
                return renderDocs();
            case 'overview':
            default:
                return renderOverview();
        }
    };

    const activeLabel =
        NAV_ITEMS.find((item) => item.id === activeView)?.label
        || 'Overview';

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    <span className="brand-mark">C</span>
                    <span>Centry</span>
                </div>

                <nav className="side-nav">
                    {NAV_ITEMS.map((item) => (
                        <button
                            type="button"
                            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                            key={item.id}
                            onClick={() => setActiveView(item.id)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {item.label}
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
                    Centry Protocol
                    <br />
                    <span>Arc-native USDC lending</span>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div className="breadcrumb">
                        <span>CENTRY</span>
                        <b>/</b>
                        {activeLabel}
                    </div>
                    <div className="topbar-actions">
                        <button
                            type="button"
                            className="refresh-btn"
                            onClick={handleRefresh}
                        >
                            Refresh
                        </button>
                        <WalletConnect />
                    </div>
                </header>

                {!isConnected && (
                    <div className="notice-panel">
                        Connect your wallet to enable transaction controls. Public market metrics remain readable.
                    </div>
                )}

                {notice && (
                    <div className="notice-panel">
                        {notice}
                    </div>
                )}

                {(lendingError || governanceError) && (
                    <div className="panel error-panel">
                        <strong>Onchain error</strong>
                        <p>
                            {txMessage(lendingError || governanceError)}
                        </p>
                    </div>
                )}

                {renderView()}

                <footer className="page-footer">
                    <span>Centry Protocol</span>
                    <span>Built on Arc · Testnet</span>
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

export default function App() {
    return (
        <Providers>
            <Dashboard />
        </Providers>
    );
}
