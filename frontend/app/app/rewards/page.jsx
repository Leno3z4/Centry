'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import { formatUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';
import { VE_CENTRY_ABI } from '../../../constants/abis';

const ARC_CHAIN_ID = 5042002;
const REWARDS_ABI = [
  { type: 'function', name: 'latestEpoch', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'epochRoots', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'epochRewardBudget', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'epochClaimed', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'pendingEpochs', stateMutability: 'view', inputs: [{ name: 'epoch', type: 'uint256' }],
    outputs: [
      { name: 'root', type: 'bytes32' },
      { name: 'rewardBudget', type: 'uint256' },
      { name: 'readyAt', type: 'uint40' },
    ],
  },
  {
    type: 'function', name: 'claimed', stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'claim', stateMutability: 'nonpayable',
    inputs: [
      { name: 'epoch', type: 'uint256' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'proof', type: 'bytes32[]' },
    ],
    outputs: [{ type: 'uint256' }],
  },
];

const ZERO_ROOT = `0x${'0'.repeat(64)}`;

function errorText(error) {
  return error?.shortMessage || error?.message || 'Transaction failed.';
}

function formatCENT(amount) {
  try {
    return Number(formatUnits(BigInt(String(amount ?? 0)), 18)).toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  } catch {
    return '0.0';
  }
}

function formatCountdown(seconds) {
  if (seconds <= 0) return 'Ready to activate';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

export default function Page() {
  return (
    <Providers>
      <AppShell>
        <RewardsContent />
      </AppShell>
    </Providers>
  );
}

function RewardsContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();
  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [claimingTokenId, setClaimingTokenId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/reward-manifest.json', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Manifest request failed (${response.status}).`);
        const data = await response.json();
        if (!cancelled) setManifest(data);
      })
      .catch((caughtError) => {
        if (!cancelled) setManifestError(errorText(caughtError));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const manifestEpoch = BigInt(manifest?.epoch || 0);
  const manifestRoot = manifest?.root || ZERO_ROOT;

  const { data: latestEpoch } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'latestEpoch',
  });
  const { data: epochRoot } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'epochRoots',
    args: [manifestEpoch],
    query: { enabled: Boolean(manifest?.epoch) },
  });
  const { data: epochBudget } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'epochRewardBudget',
    args: [manifestEpoch],
    query: { enabled: Boolean(manifest?.epoch) },
  });
  const { data: epochClaimed } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'epochClaimed',
    args: [manifestEpoch],
    query: { enabled: Boolean(manifest?.epoch) },
  });
  const { data: pendingEpoch } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'pendingEpochs',
    args: [manifestEpoch],
    query: { enabled: Boolean(manifest?.epoch) },
  });
  const { data: ownedTokenIds } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentry,
    abi: VE_CENTRY_ABI,
    functionName: 'getOwnedTokenIds',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && chainId === ARC_CHAIN_ID) },
  });

  const positions = manifest?.positions || [];
  const ownedSet = useMemo(() => new Set((ownedTokenIds || []).map((tokenId) => String(tokenId))), [ownedTokenIds]);
  const userPositions = positions.filter((position) => ownedSet.has(String(position.tokenId)));

  const positionContracts = userPositions.map((position) => ({
    address: CONTRACT_ADDRESSES.veCentryRewards,
    abi: REWARDS_ABI,
    functionName: 'claimed',
    args: [manifestEpoch, BigInt(position.tokenId)],
  }));
  const { data: positionState, refetch: refetchPositionState } = useReadContracts({
    contracts: positionContracts,
    query: { enabled: Boolean(isConnected && manifest && userPositions.length > 0 && chainId === ARC_CHAIN_ID) },
  });

  const rootMatches = Boolean(
    manifest && epochRoot && epochRoot !== ZERO_ROOT && String(epochRoot).toLowerCase() === String(manifestRoot).toLowerCase(),
  );
  const active = Boolean(rootMatches && latestEpoch !== undefined && latestEpoch >= manifestEpoch);
  const pendingRoot = pendingEpoch?.[0] || ZERO_ROOT;
  const readyAt = Number(pendingEpoch?.[2] || 0n);
  const pendingForManifest = Boolean(
    manifest && pendingRoot !== ZERO_ROOT && String(pendingRoot).toLowerCase() === String(manifestRoot).toLowerCase(),
  );
  const pendingCountdown = pendingForManifest ? Math.max(0, readyAt - now) : 0;

  const claimPosition = async (position, index) => {
    if (!isConnected || chainId !== ARC_CHAIN_ID || !active || !rootMatches) return;
    if (Boolean(positionState?.[index]?.result)) return;
    setClaimingTokenId(String(position.tokenId));
    setNotice('');
    setError('');
    try {
      if (!publicClient) throw new Error('Wallet client is not ready.');
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.veCentryRewards,
        abi: REWARDS_ABI,
        functionName: 'claim',
        args: [manifestEpoch, BigInt(position.tokenId), BigInt(position.amount), position.proof || []],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refetchPositionState();
      setNotice('Reward claimed successfully.');
    } catch (caughtError) {
      setError(errorText(caughtError));
    } finally {
      setClaimingTokenId(null);
    }
  };

  const manifestFallbackBudget = manifest?.positions?.reduce((sum, position) => sum + BigInt(position.amount), 0n) ?? 0n;
  const epochStatus = active ? 'ACTIVE' : pendingForManifest ? 'IN PROGRESS' : 'AWAITING';
  const epochStatusHint = active ? 'Claims are live' : pendingForManifest ? 'Timelock is running' : 'Waiting for distribution';

  return (
    <div className="page-stack">
      <div className="section-header reward-section-header">
        <div>
          <span className="section-kicker">REWARDS</span>
          <h1>Protocol rewards</h1>
          <p>Revenue-funded CENT rewards are published by epoch and verified onchain.</p>
        </div>
        <div className={`reward-header-status ${active ? 'is-active' : pendingForManifest ? 'is-progress' : ''}`}>
          <span className="reward-status-dot" />
          <span>{active ? 'Epoch active' : pendingForManifest ? 'Epoch in progress' : 'Awaiting distribution'}</span>
        </div>
      </div>

      {manifestError ? <div className="notice reward-error">{manifestError}</div> : null}
      {error ? <div className="notice reward-error">{error}</div> : null}
      {notice ? <div className="notice reward-notice">{notice}</div> : null}

      <section className="stats-grid rewards-stats-grid">
        <div className="metric reward-metric">
          <span>Current epoch</span>
          <strong>{manifest?.epoch ?? '—'}</strong>
          <small>{active ? 'Active onchain' : pendingForManifest ? 'Queued onchain' : 'Not active'}</small>
        </div>
        <div className="metric reward-metric">
          <span>Reward budget</span>
          <strong>{formatCENT(epochBudget ?? manifestFallbackBudget)} CENT</strong>
          <small>{epochBudget !== undefined ? 'Onchain budget' : 'Manifest total'}</small>
        </div>
        <div className="metric reward-metric">
          <span>Distributed</span>
          <strong>{formatCENT(epochClaimed ?? 0n)} CENT</strong>
          <small>Claimed from this epoch</small>
        </div>
        <div className="metric reward-metric reward-status-metric">
          <span>Root status</span>
          <strong>{epochStatus}</strong>
          <small>{epochStatusHint}</small>
        </div>
      </section>

      <section className="content-grid rewards-content-grid">
        <div className="panel panel-large">
          <div className="panel-head">
            <div>
              <span className="section-kicker">YOUR REWARDS</span>
              <h2>veCENT positions</h2>
            </div>
          </div>
          {!isConnected ? (
            <div className="connect-prompt">Connect your wallet to see rewards attached to your veCENT positions.</div>
          ) : userPositions.length === 0 ? (
            <div className="connect-prompt">No eligible veCENT reward position is present in the published manifest.</div>
          ) : (
            <div className="reward-position-list">
              {userPositions.map((position, index) => {
                const claimed = Boolean(positionState?.[index]?.result);
                const claiming = claimingTokenId === String(position.tokenId) || isPending;
                return (
                  <article className="reward-position" key={position.tokenId}>
                    <div className="reward-position-main">
                      <div className="reward-position-title">
                        <span className="token usdc">C</span>
                        <div>
                          <strong>veCENT #{position.tokenId}</strong>
                          <small>{claimed ? 'Reward claimed' : active ? 'Reward available' : 'Reward pending'}</small>
                        </div>
                      </div>
                      <div className="reward-position-amount">
                        <strong>{formatCENT(position.amount)} CENT</strong>
                        <span>{claimed ? 'Already claimed' : active ? 'Available now' : 'Pending epoch activation'}</span>
                      </div>
                    </div>
                    <div className="reward-position-actions">
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={claimed || !active || !rootMatches || claiming}
                        onClick={() => claimPosition(position, index)}
                      >
                        {claimed ? 'Claimed' : claiming ? 'Claiming…' : active ? 'Claim reward' : 'Not claimable yet'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel rewards-epoch-panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">DISTRIBUTION</span>
              <h2>Epoch status</h2>
            </div>
          </div>
          <div className="reward-status-card">
            <div><span>Manifest epoch</span><strong>{manifest?.epoch ?? '—'}</strong></div>
            <div><span>Latest active epoch</span><strong>{latestEpoch?.toString() ?? '—'}</strong></div>
            <div><span>Status</span><strong>{epochStatus}</strong></div>
            <div><span>Timelock</span><strong>{pendingForManifest ? formatCountdown(pendingCountdown) : active ? 'Complete' : '—'}</strong></div>
          </div>
          <div className="reward-progress">
            <div className="reward-progress-head"><span>Distribution progress</span><strong>{active ? 'Live' : pendingForManifest ? 'In progress' : 'Waiting'}</strong></div>
            <div className="reward-progress-track"><div className={`reward-progress-fill ${active ? 'complete' : pendingForManifest ? 'running' : ''}`} /></div>
            <p>{pendingForManifest ? 'The epoch has been queued and is moving through its safety delay before activation.' : active ? 'The epoch is active and rewards can be claimed.' : 'The protocol is waiting for the next distribution to be queued.'}</p>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .reward-section-header{align-items:flex-start}
        .reward-header-status{display:inline-flex;align-items:center;gap:9px;align-self:flex-start;padding:10px 12px;border:1px solid #30263d;border-radius:10px;background:#0e0a16;color:#bcb2c8;font-size:10px;font-weight:700;letter-spacing:.02em}
        .reward-header-status.is-progress{border-color:#4a3d5c;color:#d8cff0}
        .reward-header-status.is-active{border-color:#315744;color:#b5e8ce}
        .reward-status-dot{width:7px;height:7px;border-radius:50%;background:#8f849c}
        .reward-header-status.is-progress .reward-status-dot{background:#b99be8;box-shadow:0 0 10px rgba(185,155,232,.45)}
        .reward-header-status.is-active .reward-status-dot{background:#55dca1;box-shadow:0 0 9px rgba(85,220,161,.65)}
        .reward-notice,.reward-error{margin:0}.reward-error{border-color:#633243;background:rgba(94,30,52,.26);color:#f2a5b7}
        .rewards-stats-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
        .reward-metric strong{font-variant-numeric:tabular-nums}
        .reward-status-metric strong{letter-spacing:.02em}
        .reward-position-list{display:grid;gap:12px}.reward-position{padding:17px;border:1px solid #2d233b;border-radius:14px;background:rgba(13,9,21,.76)}
        .reward-position-main{display:flex;justify-content:space-between;gap:20px;align-items:center}.reward-position-title{display:flex;align-items:center;gap:12px}.reward-position-title .token{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#241938;color:#d9c8ff;font-weight:800}.reward-position-title strong,.reward-position-amount strong{display:block}.reward-position-title small,.reward-position-amount span{display:block;margin-top:4px;color:#8f849d;font-size:11px}.reward-position-amount{text-align:right}.reward-position-actions{display:flex;justify-content:flex-end;margin-top:15px}.reward-position-actions .primary-btn{min-width:150px}.reward-position-actions .primary-btn:disabled{opacity:.48;cursor:not-allowed}
        .reward-status-card{display:grid;gap:0;border:1px solid #2d233b;border-radius:14px;overflow:hidden;background:rgba(13,9,21,.52)}.reward-status-card>div{display:flex;justify-content:space-between;align-items:center;padding:15px 16px;border-bottom:1px solid #2a2235}.reward-status-card>div:last-child{border-bottom:0}.reward-status-card span{color:#91869f;font-size:12px}.reward-status-card strong{font-size:13px}.reward-progress{margin-top:16px;padding:16px;border:1px solid #2d233b;border-radius:14px;background:rgba(15,10,24,.56)}.reward-progress-head{display:flex;justify-content:space-between;gap:16px;font-size:12px}.reward-progress-head span{color:#8f849d}.reward-progress-head strong{font-size:11px;text-transform:uppercase;letter-spacing:.08em}.reward-progress-track{height:5px;margin-top:12px;border-radius:999px;background:#251c30;overflow:hidden}.reward-progress-fill{height:100%;width:8%;border-radius:999px;background:#51405f}.reward-progress-fill.running{width:58%;background:#a992c7;box-shadow:0 0 14px rgba(169,146,199,.2)}.reward-progress-fill.complete{width:100%;background:#55dca1;box-shadow:0 0 14px rgba(85,220,161,.18)}.reward-progress p{margin:12px 0 0;color:#8f849d;font-size:11px;line-height:1.6}
        @media (max-width:900px){.rewards-stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:640px){.rewards-stats-grid{grid-template-columns:1fr}.reward-position-main{align-items:flex-start;flex-direction:column}.reward-position-amount{text-align:left}.reward-header-status{display:none}}
      `}</style>
    </div>
  );
}
