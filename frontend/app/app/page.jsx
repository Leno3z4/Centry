'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { Providers } from '../../components/Providers';
import { AppShell } from '../../components/AppShell';
import { ACTIVE_MARKETS } from '../../constants/markets';
import { CONTRACT_ADDRESSES } from '../../constants/contracts';
import { LENDING_POOL_ABI, VE_CENTRY_ABI } from '../../constants/abis';
import { useMultiMarketLending } from '../../hooks/useMultiMarketLending';
import { useVeGovernance } from '../../hooks/useVeGovernance';

const AeroShards = dynamic(() => import('../../components/AeroShards'), { ssr: false, loading: () => null });

const ARC_CHAIN_ID = 5042002;
const ZERO_ROOT = `0x${'0'.repeat(64)}`;
const REWARDS_ABI = [
  { type: 'function', name: 'latestEpoch', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'pendingEpochs', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: 'root', type: 'bytes32' }, { name: 'rewardBudget', type: 'uint256' }, { name: 'readyAt', type: 'uint40' }] },
  { type: 'function', name: 'epochRewardBudget', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
];

function formatNumber(value, digits = 1) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.0';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCENT(value) {
  try {
    return formatNumber(Number(formatUnits(BigInt(String(value ?? 0)), 18)), 1);
  } catch {
    return '0.0';
  }
}

function formatCountdown(seconds) {
  if (seconds <= 0) return 'Ready soon';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

function HealthMeter({ percent, factor }) {
  const safe = Math.min(Math.max(Number(percent || 0), 0), 100);
  return (
    <div className="health-meter">
      <div className="health-meter-head">
        <span>Position health</span>
        <strong>{safe}%</strong>
      </div>
      <div className="health-factor-label">Health factor {factor || '—'}</div>
      <div className="health-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={safe} aria-label="Position health">
        <div className="health-fill" style={{ width: `${safe}%` }} />
      </div>
      <p>Higher is safer. A healthy account stays above the liquidation boundary.</p>
    </div>
  );
}

function OverviewContent() {
  const { address, isConnected } = useAccount();
  const firstMarket = useMemo(() => ACTIVE_MARKETS[0], []);
  const lending = useMultiMarketLending(firstMarket?.address, firstMarket?.decimals);
  const governance = useVeGovernance();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const rewardEpochGuess = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'latestEpoch',
    query: { enabled: true },
  });
  const latestEpoch = rewardEpochGuess.data ?? 0n;
  const nextEpoch = latestEpoch + 1n;
  const pendingEpoch = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'pendingEpochs',
    args: [nextEpoch],
    query: { enabled: nextEpoch > 0n },
  });

  const pendingRoot = pendingEpoch.data?.[0] || ZERO_ROOT;
  const readyAt = Number(pendingEpoch.data?.[2] || 0n);
  const rewardPending = pendingRoot !== ZERO_ROOT && readyAt > 0;
  const pendingCountdown = rewardPending ? Math.max(0, readyAt - now) : 0;
  const walletVotingPower = governance.votingPower;

  return (
    <div className="page-stack">
      <div className="overview-aero-background" aria-hidden="true">
        <AeroShards
          backgroundColor="#120F17"
          shardColor="#896ABD"
          accentColor="#A855F7"
          placement="full"
          flow="stream"
          material="pearl"
          detail="balanced"
          effect="none"
          scale={1}
          spread={1}
          depth={1}
          speed={1}
          spin={1}
          interaction="repel"
          density={1.5}
          shardSize={1.1}
          stretch={1}
          turbulence={1}
          glow={1}
          edgeSoftness={2}
          bloom={0.5}
          grain={0.05}
          chromaticAberration={0.0075}
          transitionDuration={1}
          interactionRadius={1.5}
          interactionStrength={0.5}
          rippleIntensity={1}
          holdToGather={true}
        />
      </div>
      <section className="hero">
        <div className="hero-copy">
          <h1>Liquidity,<br /><em>built for Arc.</em></h1>
          <p>Centry is an Arc-native money market for lending, borrowing, swaps, and onchain risk management.</p>
          <div className="hero-actions">
            <a className="primary-btn" href="/app/lending">Open lending</a>
            <a className="secondary-btn" href="/app/swap">Swap assets</a>
          </div>
        </div>
        <div className="orbital-art" aria-hidden="true">
          <div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="orbit orbit-c" />
          <div className="usdc-orb"><span>$</span></div>
        </div>
      </section>

      <section className="stats-grid overview-stats-grid">
        <div className="metric"><span>Supplied</span><strong>{isConnected ? `${formatNumber(lending.supplyBalance, 1)} ${firstMarket?.symbol || ''}` : '—'}</strong><small>Your active deposit</small></div>
        <div className="metric"><span>Borrowed</span><strong>{isConnected ? `${formatNumber(lending.borrowBalance, 1)} ${firstMarket?.symbol || ''}` : '—'}</strong><small>Your active debt</small></div>
        <div className="metric"><span>Health factor</span><strong>{isConnected ? lending.healthFactor : '—'}</strong><small>{isConnected ? `${lending.healthFactorPercent}% account health` : 'Connect wallet'}</small></div>
        <div className="metric"><span>Borrow room</span><strong>{isConnected ? `$${formatNumber(lending.borrowLimit, 1)}` : '—'}</strong><small>Remaining borrowing power</small></div>
      </section>

      <section className="content-grid">
        <div className="panel panel-large">
          <div className="panel-head"><div><h2>Available markets</h2></div><a className="text-link" href="/app/lending">View lending →</a></div>
          <div className="market-list">
            {ACTIVE_MARKETS.map((market) => (
              <a key={market.id} href="/app/lending" className="market-list-item">
                <div className="asset"><span className="token usdc">{market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : '$'}</span><div><strong>{market.symbol}</strong><small>{market.name}</small></div></div>
                <div><span>Status</span><strong className="status-live">Live</strong></div>
                <div><span>Network</span><strong>Arc Testnet</strong></div>
                <span className="market-arrow">Open</span>
              </a>
            ))}
          </div>
        </div>

        <div className="panel overview-account-panel">
          <div className="panel-head"><div><h2>Position</h2></div></div>
          {isConnected ? <HealthMeter percent={lending.healthFactorPercent} factor={lending.healthFactor} /> : <div className="connect-prompt">Connect your wallet to see account health and position details.</div>}
          <a className="secondary-btn full-btn" href="/app/portfolio">View portfolio</a>
        </div>
      </section>

      <section className="content-grid overview-bottom-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>veCENT</h2></div><a className="text-link" href="/app/governance">Manage →</a></div>
          <div className="overview-feature-number">{isConnected ? `${formatNumber(walletVotingPower, 1)}` : '—'}</div>
          <div className="overview-feature-label">Voting power</div>
          <div className="overview-inline-stats">
            <span>Locked <strong>{isConnected ? `${formatNumber(governance.lockedAmount, 1)} CENT` : '—'}</strong></span>
            <span>Positions <strong>{isConnected ? governance.veBalance : '—'}</strong></span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h2>Latest distribution</h2></div><a className="text-link" href="/app/rewards">Open →</a></div>
          <div className="overview-reward-row"><div><span className="overview-feature-label">Epoch</span><strong className="overview-reward-value">{rewardPending ? nextEpoch.toString() : latestEpoch.toString()}</strong></div><div className="overview-reward-right"><span className={`reward-mini-status ${rewardPending ? 'pending' : 'live'}`}>{rewardPending ? 'IN PROGRESS' : 'ACTIVE'}</span><small>{rewardPending ? formatCountdown(pendingCountdown) : 'Claims available'}</small></div></div>
          <div className="overview-reward-line"><span>Voting power</span><strong>{isConnected ? formatNumber(walletVotingPower, 1) : '—'}</strong></div>
          <div className="overview-reward-line"><span>Manage rewards</span><strong className="text-link">Open rewards →</strong></div>
        </div>
      </section>

      <style jsx global>{`
        .page-stack{position:relative;isolation:isolate}
        .overview-aero-background{position:fixed;inset:0;z-index:0;opacity:.10;pointer-events:none;overflow:hidden}
        .overview-aero-background > *{width:100%;height:100%}
        .page-stack > :not(.overview-aero-background){position:relative;z-index:1}
        .overview-stats-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
        .overview-bottom-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .panel-head .text-link,.text-link{color:#bda9e9;text-decoration:none;font-size:11px}
        .text-link:hover{color:#e2d7ff}
        .overview-feature-number{margin-top:4px;font-size:34px;font-weight:700;letter-spacing:-.03em}
        .overview-feature-label{margin-top:4px;color:#8f849d;font-size:11px}
        .overview-inline-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px;padding-top:15px;border-top:1px solid #2a2235;color:#8f849d;font-size:11px}
        .overview-inline-stats strong{display:block;margin-top:4px;color:#e9e1f1;font-size:12px}
        .overview-reward-row{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:4px}
        .overview-reward-value{display:block;margin-top:5px;font-size:30px;letter-spacing:-.02em}
        .overview-reward-right{text-align:right}.reward-mini-status{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.08em}.reward-mini-status.pending{color:#c8b7e4}.reward-mini-status.live{color:#75ddb2}.overview-reward-right small{display:block;margin-top:5px;color:#8f849d;font-size:11px}
        .overview-reward-line{display:flex;justify-content:space-between;align-items:center;padding-top:14px;margin-top:14px;border-top:1px solid #2a2235;color:#8f849d;font-size:11px}.overview-reward-line strong{color:#e9e1f1}
        @media (max-width:900px){.overview-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.overview-bottom-grid{grid-template-columns:1fr}}
        @media (max-width:640px){.overview-stats-grid{grid-template-columns:1fr}.overview-reward-row{align-items:flex-start;flex-direction:column}.overview-reward-right{text-align:left}}
      `}</style>
    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><OverviewContent /></AppShell></Providers>;
}
