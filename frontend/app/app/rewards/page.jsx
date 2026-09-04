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
  { type: 'function', name: 'selfRepayRecipient', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_ROOT = `0x${'0'.repeat(64)}`;

function errorText(error) {
  return error?.shortMessage || error?.message || 'Transaction failed.';
}

function formatCENT(amount) {
  try {
    return Number(formatUnits(BigInt(String(amount ?? 0)), 18)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  } catch {
    return '0';
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

  const positionContracts = userPositions.flatMap((position) => [
    {
      address: CONTRACT_ADDRESSES.veCentryRewards,
      abi: REWARDS_ABI,
      functionName: 'claimed',
      args: [manifestEpoch, BigInt(position.tokenId)],
    },
    {
      address: CONTRACT_ADDRESSES.veCentryRewards,
      abi: REWARDS_ABI,
      functionName: 'selfRepayRecipient',
      args: [BigInt(position.tokenId)],
    },
  ]);
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
    if (Boolean(positionState?.[index * 2]?.result)) return;
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

  return (
    <div className="page-stack">
      <div className="section-header">
        <div>
          <span className="section-kicker">REWARDS</span>
          <h1>Protocol rewards</h1>
          <p>Revenue-funded CENT rewards are published by epoch and verified against the onchain Merkle root.</p>
        </div>
        <div className="reward-header-status">
          <span className={`reward-status-dot ${active ? 'active' : ''}`} />
          <span>{active ? 'Epoch active' : pendingForManifest ? 'Epoch queued' : 'Awaiting distribution'}</span>
        </div>
      </div>

      {manifestError ? <div className="notice reward-error">{manifestError}</div> : null}
      {error ? <div className="notice reward-error">{error}</div> : null}
      {notice ? <div className="notice reward-notice">{notice}</div> : null}

      <section className="stats-grid">
        <div className="metric"><span>Current epoch</span><strong>{manifest?.epoch ?? '—'}</strong><small>{active ? 'Active onchain' : pendingForManifest ? 'Queued onchain' : 'Not active'}</small></div>
        <div className="metric"><span>Reward budget</span><strong>{formatCENT(epochBudget ?? manifestFallbackBudget)} CENT</strong><small>{epochBudget !== undefined ? 'Onchain budget' : 'Manifest total'}</small></div>
        <div className="metric"><span>Distributed</span><strong>{formatCENT(epochClaimed ?? 0n)} CENT</strong><small>Claimed from this epoch</small></div>
        <div className="metric"><span>Root status</span><strong>{rootMatches ? 'MATCH' : 'WAIT'}</strong><small>{rootMatches ? 'Manifest matches chain' : 'Manifest not active yet'}</small></div>
      </section>

      <section className="content-grid">
        <div className="panel panel-large">
          <div className="panel-head"><div><span className="section-kicker">YOUR REWARDS</span><h2>veCENT positions</h2></div></div>
          {!isConnected ? (
            <div className="connect-prompt">Connect your wallet to see rewards attached to your veCENT positions.</div>
          ) : userPositions.length === 0 ? (
            <div className="connect-prompt">No eligible veCENT reward position is present in the published manifest.</div>
          ) : (
            <div className="reward-position-list">
              {userPositions.map((position, index) => {
                const claimed = Boolean(positionState?.[index * 2]?.result);
                const selfRepayRecipient = positionState?.[index * 2 + 1]?.result;
                const selfRepayEnabled = Boolean(selfRepayRecipient && selfRepayRecipient !== ZERO_ADDRESS);
                const claiming = claimingTokenId === String(position.tokenId) || isPending;
                return (
                  <article className="reward-position" key={position.tokenId}>
                    <div className="reward-position-main">
                      <div className="reward-position-title">
                        <span className="token usdc">C</span>
                        <div><strong>veCENT #{position.tokenId}</strong><small>{selfRepayEnabled ? 'Self-repay configured' : 'Standard claim'}</small></div>
                      </div>
                      <div className="reward-position-amount"><strong>{formatCENT(position.amount)} CENT</strong><span>{claimed ? 'Already claimed' : active ? 'Available' : 'Pending epoch activation'}</span></div>
                    </div>
                    <div className="reward-position-actions">
                      <div className="reward-mini-stats"><span>Proof items <strong>{position.proof?.length || 0}</strong></span><span>Self-repay <strong>{selfRepayEnabled ? 'ON' : 'OFF'}</strong></span></div>
                      <button type="button" className="primary-btn" disabled={claimed || !active || !rootMatches || claiming} onClick={() => claimPosition(position, index)}>
                        {claimed ? 'Claimed' : claiming ? 'Claiming…' : active ? 'Claim reward' : 'Not claimable yet'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><div><span className="section-kicker">DISTRIBUTION</span><h2>Epoch status</h2></div></div>
          <div className="reward-status-card">
            <div><span>Manifest epoch</span><strong>{manifest?.epoch ?? '—'}</strong></div>
            <div><span>Latest active epoch</span><strong>{latestEpoch?.toString() ?? '—'}</strong></div>
            <div><span>Pending root</span><strong>{pendingForManifest ? 'Matches manifest' : '—'}</strong></div>
            <div><span>Timelock</span><strong>{pendingForManifest ? formatCountdown(pendingCountdown) : active ? 'Complete' : '—'}</strong></div>
          </div>
          <div className="reward-root-block"><span>Merkle root</span><code>{manifestRoot}</code></div>
          <div className="reward-explainer"><strong>Self-repay</strong><p>When configured, the keeper can route the position's CENT reward through the repayment path instead of requiring a manual claim.</p></div>
        </div>
      </section>

      <style jsx global>{`
        .reward-header-status{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;padding:10px 12px;border:1px solid #30263d;border-radius:10px;background:#0e0a16;color:#bcb2c8;font-size:10px;font-weight:700}
        .reward-status-dot{width:7px;height:7px;border-radius:50%;background:#9a8fa7}.reward-status-dot.active{background:#55dca1;box-shadow:0 0 9px rgba(85,220,161,.65)}
        .reward-notice,.reward-error{margin:0}.reward-error{border-color:#633243;background:rgba(94,30,52,.26);color:#f2a5b7}
        .reward-position-list{display:grid;gap:12px}.reward-position{padding:15px;border:1px solid #2d233b;border-radius:14px;background:rgba(13,9,21,.76)}
        .reward-position-main,.reward-position-actions{display:flex;align-items:center;justify-content:space-between;gap:16px}.reward-position-actions{margin-top:14px;padding-top:12px;border-top:1px solid #251d31}
        .reward-position-title{display:flex;align-items:center;gap:11px;min-width:0}.reward-position-title>div{display:grid;gap:4px}.reward-position-title strong{color:#f7f3ff;font-size:13px}.reward-position-title small,.reward-position-amount span,.reward-mini-stats{color:#81778f;font-size:10px}
        .reward-position-amount{display:grid;gap:5px;text-align:right}.reward-position-amount strong{color:#d9c8ff;font-size:16px}.reward-mini-stats{display:flex;flex-wrap:wrap;gap:14px}.reward-mini-stats span{display:inline-flex;gap:5px}.reward-mini-stats strong{color:#bda6df}
        .reward-status-card{display:grid;gap:12px}.reward-status-card>div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:11px;border-bottom:1px solid #241d2f}.reward-status-card span,.reward-root-block>span{color:#7f758b;font-size:10px}.reward-status-card strong{color:#eee8f6;font-size:11px;text-align:right}
        .reward-root-block{display:grid;gap:8px;margin-top:18px}.reward-root-block code{overflow-wrap:anywhere;padding:10px;border:1px solid #2d2439;border-radius:9px;background:#0a0710;color:#a998bc;font:9px 'DM Mono',monospace;line-height:1.5}
        .reward-explainer{margin-top:18px;padding:13px;border:1px solid #352946;border-radius:11px;background:rgba(44,25,67,.28)}.reward-explainer strong{color:#d7c4f4;font-size:11px}.reward-explainer p{margin:7px 0 0;color:#887e94;font-size:10px;line-height:1.55}
        @media (max-width:740px){.reward-position-main,.reward-position-actions{align-items:flex-start;flex-direction:column}.reward-position-amount{text-align:left}.reward-position-actions .primary-btn{width:100%}}
      `}</style>
    </div>
  );
}
