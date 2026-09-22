'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { Providers } from '../../components/Providers';
import { AppShell } from '../../components/AppShell';
import { ACTIVE_MARKETS } from '../../constants/markets';
import { CONTRACT_ADDRESSES } from '../../constants/contracts';
import { LENDING_POOL_ABI, VE_CENTRY_ABI } from '../../constants/abis';
import { useMultiMarketLending } from '../../hooks/useMultiMarketLending';
import { useVeGovernance } from '../../hooks/useVeGovernance';

const AeroShards = dynamic(() => import('../../components/AeroShards'), { ssr: false, loading: () => null });

const ARC_CHAIN_ID = 5042;
const ZERO_ROOT = `0x${'0'.repeat(64)}`;
const REWARDS_ABI = [
  { type: 'function', name: 'latestEpoch', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'epochRoots', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'epochRewardBudget', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'epochClaimed', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'pendingEpochs', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ name: 'root', type: 'bytes32' }, { name: 'rewardBudget', type: 'uint256' }, { name: 'readyAt', type: 'uint40' }] },
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
        <span>Account health</span>
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
  const marketConfigContracts = useMemo(
    () => ACTIVE_MARKETS.map((market) => ({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'getReserveConfig',
      args: [market.address],
    })),
    [],
  );
  const { data: marketConfigs, isLoading: marketConfigsLoading } = useReadContracts({
    contracts: marketConfigContracts,
    query: { enabled: Boolean(CONTRACT_ADDRESSES.lendingPool) },
  });
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
  const { data: latestRewardRoot } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'epochRoots',
    args: [latestEpoch],
    query: { enabled: latestEpoch > 0n },
  });
  const { data: latestRewardBudget } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'epochRewardBudget',
    args: [latestEpoch],
    query: { enabled: latestEpoch > 0n },
  });
  const { data: latestRewardClaimed } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'epochClaimed',
    args: [latestEpoch],
    query: { enabled: latestEpoch > 0n },
  });
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
  const hasLatestRewardRoot = latestRewardRoot && String(latestRewardRoot).toLowerCase() !== ZERO_ROOT.toLowerCase();
  const latestRewardBudgetValue = BigInt(latestRewardBudget || 0n);
  const latestRewardClaimedValue = BigInt(latestRewardClaimed || 0n);
  const rewardFullyClaimed = Boolean(
    hasLatestRewardRoot &&
    latestRewardBudgetValue > 0n &&
    latestRewardClaimedValue >= latestRewardBudgetValue,
  );
  const rewardActive = Boolean(
    hasLatestRewardRoot &&
    latestRewardBudgetValue > 0n &&
    latestRewardClaimedValue < latestRewardBudgetValue,
  );
  const rewardStatus = rewardActive
    ? 'ACTIVE'
    : rewardFullyClaimed
      ? 'FULLY CLAIMED'
      : rewardPending
        ? 'PREPARING'
        : 'AWAITING';
  const rewardStatusHint = rewardActive
    ? 'Claims available'
    : rewardFullyClaimed
      ? 'Current epoch fully claimed'
      : rewardPending
        ? formatCountdown(pendingCountdown)
        : 'No active reward epoch';
  const rewardEpochLabel = rewardPending ? 'Next allocation' : rewardActive ? 'Current epoch' : 'Next allocation';
  const rewardEpochValue = rewardPending ? nextEpoch : latestEpoch;
  const walletVotingPower = governance.votingPower;

  return (
    <div className="page-stack">
      <div className="overview-aero-background" aria-hidden="true">
        <AeroShards
          backgroundColor="#0b0d10"
          shardColor="#4a4f58"
          accentColor="#a79bdb"
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
          <h1>See where you<br /><em>stand.</em></h1>
          <p>Check your balances, then choose what to do next.</p>
          <div className="hero-actions">
            <a className="primary-btn" href="/app/portfolio">View portfolio</a>
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
        <div className="metric"><span>Account health</span><strong>{isConnected ? lending.healthFactor : '—'}</strong><small>{isConnected ? `${lending.healthFactorPercent}% account health` : 'Connect wallet'}</small></div>
        <div className="metric"><span>Available to borrow</span><strong>{isConnected ? `$${formatNumber(lending.borrowLimit, 1)}` : '—'}</strong><small>Based on your current position</small></div>
      </section>
      <section className="content-grid">
        <div className="panel panel-large">
          <div className="panel-head"><div><h2>Available markets</h2></div><a className="text-link" href="/app/markets">View markets →</a></div>
          <div className="market-list">
            {ACTIVE_MARKETS.map((market, index) => {
              const configRead = marketConfigs?.[index];
              const reserveActive = configRead?.status === 'success' ? Boolean(configRead.result?.[0]) : null;
              const reserveStatus = marketConfigsLoading || reserveActive === null
                ? 'Checking…'
                : reserveActive
                  ? 'Active'
                  : 'Inactive';
              return (
                <a
                  key={market.id}
                  href={'/app/markets/' + market.id}
                  className="market-list-item"
                >
                  <div className="asset">
                    <span className="token usdc">{market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : '
          </div>
        </div>

        <div className="panel overview-account-panel">
          <div className="panel-head"><div><h2>Your position</h2></div></div>
          {isConnected ? <HealthMeter percent={lending.healthFactorPercent} factor={lending.healthFactor} /> : <div className="connect-prompt">Connect your wallet to see account health and position details.</div>}
          <a className="secondary-btn full-btn" href="/app/portfolio">View portfolio</a>
        </div>
      </section>

      <section className="content-grid overview-bottom-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>Voting power</h2></div><a className="text-link" href="/app/governance">Manage →</a></div>
          <div className="overview-feature-number">{isConnected ? formatNumber(walletVotingPower, 1) : '—'}</div>
          <div className="overview-feature-label">Voting power</div>
          <div className="overview-inline-stats">
            <span>Locked <strong>{isConnected ? formatNumber(governance.lockedAmount, 1) + ' CENT' : '—'}</strong></span>
            <span>veCENT positions <strong>{isConnected ? governance.veBalance : '—'}</strong></span>
          </div>
          <p className="panel-copy overview-card-copy">Lock CENT to get voting power and share in protocol rewards.</p>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Rewards</h2></div><a className="text-link" href="/app/rewards">Open →</a></div>
          <div className="overview-reward-row"><div><span className="overview-feature-label">{rewardEpochLabel}</span><strong className="overview-reward-value">{rewardEpochValue.toString()}</strong></div><div className="overview-reward-right"><span className={`reward-mini-status ${rewardActive ? 'live' : rewardPending ? 'pending' : 'idle'}`}>{rewardStatus}</span><small>{rewardStatusHint}</small></div></div>
          <div className="overview-reward-line"><span>Voting power</span><strong>{isConnected ? formatNumber(walletVotingPower, 1) : '—'}</strong></div>
          <div className="overview-reward-line"><span>Reward destination</span><strong>Wallet or self-repay</strong></div>
        </div>
      </section>

      <style jsx global>{`
        .page-stack{position:relative;isolation:isolate}
        .overview-aero-background{position:fixed;inset:0;z-index:0;opacity:.025;pointer-events:none;overflow:hidden}
        .overview-aero-background > *{width:100%;height:100%}
        .page-stack > :not(.overview-aero-background){position:relative;z-index:1}
        .overview-card-copy{margin-bottom:0}
        .overview-stats-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
        .overview-bottom-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .panel-head .text-link,.text-link{color: #b8adcb;text-decoration:none;font-size:11px}
        .text-link:hover{color:#e2d7ff}
        .overview-feature-number{margin-top:4px;font-size:34px;font-weight:700;letter-spacing:-.03em}
        .overview-feature-label{margin-top:4px;color:#8f849d;font-size:11px}
        .overview-inline-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px;padding-top:15px;border-top:1px solid #2a2235;color:#8f849d;font-size:11px}
        .overview-inline-stats strong{display:block;margin-top:4px;color:#e9e1f1;font-size:12px}
        .overview-reward-row{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:4px}
        .overview-reward-value{display:block;margin-top:5px;font-size:30px;letter-spacing:-.02em}
        .overview-reward-right{text-align:right}.reward-mini-status{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.08em}.reward-mini-status.pending{color:#c8b7e4}.reward-mini-status.live{color:#75ddb2}.overview-reward-right small{display:block;margin-top:5px;color:#8f849d;font-size:11px}
        .overview-reward-line{display:flex;justify-content:space-between;align-items:center;padding-top:14px;margin-top:14px;border-top:1px solid #2a2235;color:#8f849d;font-size:11px}.overview-reward-line strong{color:#e9e1f1}
        .overview-bottom-grid{align-items:stretch}
        .overview-bottom-grid > .panel{
          position:relative;
          min-height:330px;
          overflow:hidden;
          padding:28px 30px 26px;
          border:1px solid #303030 !important;
          border-radius:22px !important;
          background:
            radial-gradient(circle at 85% 0%, rgba(255,255,255,.055), transparent 32%),
            linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 24%),
            linear-gradient(180deg, #111111 0%, #0d0d0d 58%, #090909 100%) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.065),
            inset 0 -1px 0 rgba(0,0,0,.7),
            0 24px 60px rgba(0,0,0,.34) !important;
        }
        .overview-bottom-grid > .panel::after{
          content:'';
          position:absolute;
          inset:0;
          pointer-events:none;
          border-radius:inherit;
          background:linear-gradient(112deg, rgba(255,255,255,.028), transparent 22%, transparent 72%, rgba(255,255,255,.018));
        }
        .overview-bottom-grid .panel-head{
          position:relative;
          z-index:1;
          margin-bottom:28px;
          align-items:center;
        }
        .overview-bottom-grid .panel-head h2{
          margin:0;
          font-size:23px;
          letter-spacing:-.55px;
        }
        .overview-bottom-grid .panel-head .text-link{
          font-size:13px !important;
          color:#0a84ff !important;
        }
        .overview-bottom-grid .panel-head .text-link:hover{
          color:#69b5ff !important;
        }
        .overview-feature-number{
          position:relative;
          z-index:1;
          margin-top:0;
          font-size:58px;
          line-height:.98;
          font-weight:680;
          letter-spacing:-2.8px;
          color:#ffffff;
          text-shadow:0 8px 28px rgba(0,0,0,.3);
        }
        .overview-feature-label{
          position:relative;
          z-index:1;
          margin-top:8px;
          color:rgba(255,255,255,.58);
          font-size:13px;
        }
        .overview-inline-stats{
          position:relative;
          z-index:1;
          grid-template-columns:1fr 1fr;
          gap:0;
          margin-top:28px;
          padding-top:18px;
          border-top:1px solid rgba(255,255,255,.12);
          color:rgba(255,255,255,.62);
          font-size:12px;
        }
        .overview-inline-stats > span{
          min-width:0;
        }
        .overview-inline-stats > span + span{
          padding-left:22px;
          border-left:1px solid rgba(255,255,255,.08);
        }
        .overview-inline-stats strong{
          margin-top:7px;
          color:#ffffff;
          font-size:14px;
          font-weight:600;
        }
        .overview-card-copy{
          position:relative;
          z-index:1;
          max-width:560px;
          margin:24px 0 0 !important;
          color:rgba(255,255,255,.70) !important;
          font-size:14px !important;
          line-height:1.55 !important;
        }
        .overview-reward-row{
          position:relative;
          z-index:1;
          margin-top:0;
          padding:2px 0 22px;
          border-bottom:1px solid rgba(255,255,255,.12);
        }
        .overview-reward-row > div:first-child{
          display:flex;
          flex-direction:column;
          gap:6px;
        }
        .overview-reward-value{
          margin-top:0;
          font-size:54px;
          line-height:1;
          letter-spacing:-2.6px;
          color:#ffffff;
          font-weight:680;
        }
        .overview-reward-right{
          display:flex;
          flex-direction:column;
          align-items:flex-end;
          gap:8px;
        }
        .reward-mini-status{
          padding:7px 10px;
          border:1px solid rgba(255,255,255,.13);
          border-radius:999px;
          background:rgba(255,255,255,.04);
          color:rgba(255,255,255,.72) !important;
          font-size:11px;
          font-weight:700;
          letter-spacing:.06em;
        }
        .reward-mini-status.live{
          border-color:rgba(52,199,89,.24);
          background:rgba(52,199,89,.07);
          color:#59d875 !important;
        }
        .reward-mini-status.pending{
          border-color:rgba(255,176,0,.22);
          background:rgba(255,176,0,.06);
          color:#ffbd3f !important;
        }
        .reward-mini-status.idle{
          border-color:rgba(255,255,255,.13);
          background:rgba(255,255,255,.035);
          color:rgba(255,255,255,.64) !important;
        }
        .overview-reward-right small{
          margin-top:0;
          color:rgba(255,255,255,.56);
          font-size:12px;
        }
        .overview-reward-line{
          position:relative;
          z-index:1;
          padding:17px 0 0;
          margin-top:17px;
          border-top:1px solid rgba(255,255,255,.08);
          color:rgba(255,255,255,.62);
          font-size:13px;
        }
        .overview-reward-line strong{
          color:#ffffff;
          font-size:13px;
          font-weight:600;
        }
        @media (max-width:640px){
          .overview-bottom-grid > .panel{min-height:0;padding:22px 20px}
          .overview-feature-number{font-size:48px}
          .overview-reward-value{font-size:48px}
          .overview-reward-right{align-items:flex-start}
          .overview-inline-stats > span + span{padding-left:14px}
        }
        @media (max-width:900px){.overview-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.overview-bottom-grid{grid-template-columns:1fr}}
        @media (max-width:640px){.overview-stats-grid{grid-template-columns:1fr}.overview-reward-row{align-items:flex-start;flex-direction:column}.overview-reward-right{text-align:left}}
      `}</style>
    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><OverviewContent /></AppShell></Providers>;
}
}</span>
                    <div><strong>{market.symbol}</strong><small>{market.name}</small></div>
                  </div>
                  <div><span>Status</span><strong className={reserveActive ? 'status-live' : ''}>{reserveStatus}</strong></div>
                  <span className="market-arrow">Open</span>
                </a>
              );
            })}
          </div>
        </div>

        <div className="panel overview-account-panel">
          <div className="panel-head"><div><h2>Your position</h2></div></div>
          {isConnected ? <HealthMeter percent={lending.healthFactorPercent} factor={lending.healthFactor} /> : <div className="connect-prompt">Connect your wallet to see account health and position details.</div>}
          <a className="secondary-btn full-btn" href="/app/portfolio">View portfolio</a>
        </div>
      </section>

      <section className="content-grid overview-bottom-grid">
        <div className="panel">
          <div className="panel-head"><div><h2>Voting power</h2></div><a className="text-link" href="/app/governance">Manage →</a></div>
          <div className="overview-feature-number">{isConnected ? formatNumber(walletVotingPower, 1) : '—'}</div>
          <div className="overview-feature-label">Voting power</div>
          <div className="overview-inline-stats">
            <span>Locked <strong>{isConnected ? formatNumber(governance.lockedAmount, 1) + ' CENT' : '—'}</strong></span>
            <span>veCENT positions <strong>{isConnected ? governance.veBalance : '—'}</strong></span>
          </div>
          <p className="panel-copy overview-card-copy">Lock CENT to get voting power and share in protocol rewards.</p>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h2>Rewards</h2></div><a className="text-link" href="/app/rewards">Open →</a></div>
          <div className="overview-reward-row"><div><span className="overview-feature-label">{rewardEpochLabel}</span><strong className="overview-reward-value">{rewardEpochValue.toString()}</strong></div><div className="overview-reward-right"><span className={`reward-mini-status ${rewardActive ? 'live' : rewardPending ? 'pending' : 'idle'}`}>{rewardStatus}</span><small>{rewardStatusHint}</small></div></div>
          <div className="overview-reward-line"><span>Voting power</span><strong>{isConnected ? formatNumber(walletVotingPower, 1) : '—'}</strong></div>
          <div className="overview-reward-line"><span>Reward destination</span><strong>Wallet or self-repay</strong></div>
        </div>
      </section>

      <style jsx global>{`
        .page-stack{position:relative;isolation:isolate}
        .overview-aero-background{position:fixed;inset:0;z-index:0;opacity:.025;pointer-events:none;overflow:hidden}
        .overview-aero-background > *{width:100%;height:100%}
        .page-stack > :not(.overview-aero-background){position:relative;z-index:1}
        .overview-card-copy{margin-bottom:0}
        .overview-stats-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
        .overview-bottom-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        .panel-head .text-link,.text-link{color: #b8adcb;text-decoration:none;font-size:11px}
        .text-link:hover{color:#e2d7ff}
        .overview-feature-number{margin-top:4px;font-size:34px;font-weight:700;letter-spacing:-.03em}
        .overview-feature-label{margin-top:4px;color:#8f849d;font-size:11px}
        .overview-inline-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px;padding-top:15px;border-top:1px solid #2a2235;color:#8f849d;font-size:11px}
        .overview-inline-stats strong{display:block;margin-top:4px;color:#e9e1f1;font-size:12px}
        .overview-reward-row{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:4px}
        .overview-reward-value{display:block;margin-top:5px;font-size:30px;letter-spacing:-.02em}
        .overview-reward-right{text-align:right}.reward-mini-status{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.08em}.reward-mini-status.pending{color:#c8b7e4}.reward-mini-status.live{color:#75ddb2}.overview-reward-right small{display:block;margin-top:5px;color:#8f849d;font-size:11px}
        .overview-reward-line{display:flex;justify-content:space-between;align-items:center;padding-top:14px;margin-top:14px;border-top:1px solid #2a2235;color:#8f849d;font-size:11px}.overview-reward-line strong{color:#e9e1f1}
        .overview-bottom-grid{align-items:stretch}
        .overview-bottom-grid > .panel{
          position:relative;
          min-height:330px;
          overflow:hidden;
          padding:28px 30px 26px;
          border:1px solid #303030 !important;
          border-radius:22px !important;
          background:
            radial-gradient(circle at 85% 0%, rgba(255,255,255,.055), transparent 32%),
            linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,0) 24%),
            linear-gradient(180deg, #111111 0%, #0d0d0d 58%, #090909 100%) !important;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.065),
            inset 0 -1px 0 rgba(0,0,0,.7),
            0 24px 60px rgba(0,0,0,.34) !important;
        }
        .overview-bottom-grid > .panel::after{
          content:'';
          position:absolute;
          inset:0;
          pointer-events:none;
          border-radius:inherit;
          background:linear-gradient(112deg, rgba(255,255,255,.028), transparent 22%, transparent 72%, rgba(255,255,255,.018));
        }
        .overview-bottom-grid .panel-head{
          position:relative;
          z-index:1;
          margin-bottom:28px;
          align-items:center;
        }
        .overview-bottom-grid .panel-head h2{
          margin:0;
          font-size:23px;
          letter-spacing:-.55px;
        }
        .overview-bottom-grid .panel-head .text-link{
          font-size:13px !important;
          color:#0a84ff !important;
        }
        .overview-bottom-grid .panel-head .text-link:hover{
          color:#69b5ff !important;
        }
        .overview-feature-number{
          position:relative;
          z-index:1;
          margin-top:0;
          font-size:58px;
          line-height:.98;
          font-weight:680;
          letter-spacing:-2.8px;
          color:#ffffff;
          text-shadow:0 8px 28px rgba(0,0,0,.3);
        }
        .overview-feature-label{
          position:relative;
          z-index:1;
          margin-top:8px;
          color:rgba(255,255,255,.58);
          font-size:13px;
        }
        .overview-inline-stats{
          position:relative;
          z-index:1;
          grid-template-columns:1fr 1fr;
          gap:0;
          margin-top:28px;
          padding-top:18px;
          border-top:1px solid rgba(255,255,255,.12);
          color:rgba(255,255,255,.62);
          font-size:12px;
        }
        .overview-inline-stats > span{
          min-width:0;
        }
        .overview-inline-stats > span + span{
          padding-left:22px;
          border-left:1px solid rgba(255,255,255,.08);
        }
        .overview-inline-stats strong{
          margin-top:7px;
          color:#ffffff;
          font-size:14px;
          font-weight:600;
        }
        .overview-card-copy{
          position:relative;
          z-index:1;
          max-width:560px;
          margin:24px 0 0 !important;
          color:rgba(255,255,255,.70) !important;
          font-size:14px !important;
          line-height:1.55 !important;
        }
        .overview-reward-row{
          position:relative;
          z-index:1;
          margin-top:0;
          padding:2px 0 22px;
          border-bottom:1px solid rgba(255,255,255,.12);
        }
        .overview-reward-row > div:first-child{
          display:flex;
          flex-direction:column;
          gap:6px;
        }
        .overview-reward-value{
          margin-top:0;
          font-size:54px;
          line-height:1;
          letter-spacing:-2.6px;
          color:#ffffff;
          font-weight:680;
        }
        .overview-reward-right{
          display:flex;
          flex-direction:column;
          align-items:flex-end;
          gap:8px;
        }
        .reward-mini-status{
          padding:7px 10px;
          border:1px solid rgba(255,255,255,.13);
          border-radius:999px;
          background:rgba(255,255,255,.04);
          color:rgba(255,255,255,.72) !important;
          font-size:11px;
          font-weight:700;
          letter-spacing:.06em;
        }
        .reward-mini-status.live{
          border-color:rgba(52,199,89,.24);
          background:rgba(52,199,89,.07);
          color:#59d875 !important;
        }
        .reward-mini-status.pending{
          border-color:rgba(255,176,0,.22);
          background:rgba(255,176,0,.06);
          color:#ffbd3f !important;
        }
        .reward-mini-status.idle{
          border-color:rgba(255,255,255,.13);
          background:rgba(255,255,255,.035);
          color:rgba(255,255,255,.64) !important;
        }
        .overview-reward-right small{
          margin-top:0;
          color:rgba(255,255,255,.56);
          font-size:12px;
        }
        .overview-reward-line{
          position:relative;
          z-index:1;
          padding:17px 0 0;
          margin-top:17px;
          border-top:1px solid rgba(255,255,255,.08);
          color:rgba(255,255,255,.62);
          font-size:13px;
        }
        .overview-reward-line strong{
          color:#ffffff;
          font-size:13px;
          font-weight:600;
        }
        @media (max-width:640px){
          .overview-bottom-grid > .panel{min-height:0;padding:22px 20px}
          .overview-feature-number{font-size:48px}
          .overview-reward-value{font-size:48px}
          .overview-reward-right{align-items:flex-start}
          .overview-inline-stats > span + span{padding-left:14px}
        }
        @media (max-width:900px){.overview-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.overview-bottom-grid{grid-template-columns:1fr}}
        @media (max-width:640px){.overview-stats-grid{grid-template-columns:1fr}.overview-reward-row{align-items:flex-start;flex-direction:column}.overview-reward-right{text-align:left}}
      `}</style>
    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><OverviewContent /></AppShell></Providers>;
}
