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

const ARC_CHAIN_ID = 5042;
const SELF_REPAY_EXECUTOR = CONTRACT_ADDRESSES.selfRepayExecutor;
const ROOT_DELAY_SECONDS = 2 * 24 * 60 * 60;
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
    type: 'function', name: 'selfRepayRecipient', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'selfRepayOwner', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'setSelfRepayRecipient', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'recipient', type: 'address' }], outputs: [],
  },
  {
    type: 'function', name: 'disableSelfRepay', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [],
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
  const [repayActionTokenId, setRepayActionTokenId] = useState(null);
  const [rewardDestination, setRewardDestination] = useState('wallet');
  const [claimFrequency, setClaimFrequency] = useState('epoch');
  const [preferencesReady, setPreferencesReady] = useState(false);

  const loadManifest = async () => {
    try {
      const response = await fetch(`/reward-manifest.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Manifest request failed (${response.status}).`);
      const data = await response.json();
      setManifest(data);
      setManifestError('');
      return data;
    } catch (caughtError) {
      setManifestError(errorText(caughtError));
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (cancelled) return;
      await loadManifest();
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
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
  const selfRepayContracts = userPositions.flatMap((position) => ([
    {
      address: CONTRACT_ADDRESSES.veCentryRewards,
      abi: REWARDS_ABI,
      functionName: 'selfRepayRecipient',
      args: [BigInt(position.tokenId)],
    },
    {
      address: CONTRACT_ADDRESSES.veCentryRewards,
      abi: REWARDS_ABI,
      functionName: 'selfRepayOwner',
      args: [BigInt(position.tokenId)],
    },
  ]));
  const { data: positionState, refetch: refetchPositionState } = useReadContracts({
    contracts: positionContracts,
    query: { enabled: Boolean(isConnected && manifest && userPositions.length > 0 && chainId === ARC_CHAIN_ID) },
  });
  const { data: selfRepayState, refetch: refetchSelfRepayState } = useReadContracts({
    contracts: selfRepayContracts,
    query: { enabled: Boolean(isConnected && userPositions.length > 0 && chainId === ARC_CHAIN_ID) },
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
  const progressPercent = active
    ? 100
    : pendingForManifest
      ? Math.min(100, Math.max(0, ((ROOT_DELAY_SECONDS - pendingCountdown) / ROOT_DELAY_SECONDS) * 100))
      : 0;

  const isSelfRepayEnabled = (index) => {
    const recipient = selfRepayState?.[index * 2]?.result;
    const configuredOwner = selfRepayState?.[index * 2 + 1]?.result;
    return Boolean(
      recipient &&
      configuredOwner &&
      String(recipient).toLowerCase() === SELF_REPAY_EXECUTOR.toLowerCase() &&
      String(configuredOwner).toLowerCase() === String(address || '').toLowerCase(),
    );
  };

  const configureSelfRepay = async (position, index) => {
    if (!isConnected || chainId !== ARC_CHAIN_ID) return;
    setRepayActionTokenId(String(position.tokenId));
    setNotice('');
    setError('');
    try {
      if (!publicClient) throw new Error('Wallet client is not ready.');
      const enabled = isSelfRepayEnabled(index);
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.veCentryRewards,
        abi: REWARDS_ABI,
        functionName: enabled ? 'disableSelfRepay' : 'setSelfRepayRecipient',
        args: enabled ? [BigInt(position.tokenId)] : [BigInt(position.tokenId), SELF_REPAY_EXECUTOR],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refetchSelfRepayState();
      setRewardDestination(enabled ? 'wallet' : 'self-repay');
      setNotice(enabled ? 'Self-repay disabled for this veCENT position.' : 'Self-repay enabled. Future eligible CENT rewards will be routed through the debt-repayment executor.');
    } catch (caughtError) {
      setError(errorText(caughtError));
    } finally {
      setRepayActionTokenId(null);
    }
  };

  useEffect(() => {
    try {
      const savedDestination = window.localStorage.getItem('centry-rewards-destination');
      const savedFrequency = window.localStorage.getItem('centry-rewards-frequency');
      if (savedDestination === 'wallet' || savedDestination === 'self-repay') setRewardDestination(savedDestination);
      if (savedFrequency === 'epoch' || savedFrequency === 'weekly') setClaimFrequency(savedFrequency);
    } finally {
      setPreferencesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem('centry-rewards-destination', rewardDestination);
    window.localStorage.setItem('centry-rewards-frequency', claimFrequency);
  }, [preferencesReady, rewardDestination, claimFrequency]);

  const claimPosition = async (position, index) => {
    if (!isConnected || chainId !== ARC_CHAIN_ID || !active || !rootMatches) return;
    if (rewardDestination !== 'wallet') return;
    if (Boolean(positionState?.[index]?.result) || isSelfRepayEnabled(index)) return;
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
      await loadManifest();
      setNotice('Reward claimed. Checking for the next published epoch…');
    } catch (caughtError) {
      setError(errorText(caughtError));
    } finally {
      setClaimingTokenId(null);
    }
  };

  const manifestFallbackBudget = manifest?.positions?.reduce((sum, position) => sum + BigInt(position.amount), 0n) ?? 0n;
  const rewardBudgetRaw = epochBudget ?? manifestFallbackBudget;
  const rewardClaimedRaw = epochClaimed ?? 0n;
  const epochFullyDistributed = Boolean(active && rewardBudgetRaw > 0n && rewardClaimedRaw >= rewardBudgetRaw);
  const epochStatus = epochFullyDistributed ? 'FULLY DISTRIBUTED' : active ? 'ACTIVE' : pendingForManifest ? 'IN PROGRESS' : 'AWAITING';
  const epochStatusHint = epochFullyDistributed ? 'All rewards for this epoch are claimed' : active ? 'Claims are live' : pendingForManifest ? 'Timelock is running' : 'Waiting for distribution';
  const newerEpochAvailable = Boolean(latestEpoch !== undefined && manifest?.epoch && latestEpoch > manifestEpoch);


  const userRewardTotalRaw = userPositions.reduce((sum, position) => sum + BigInt(position.amount || 0), 0n);
  const claimableCount = userPositions.filter((position, index) => (
    active &&
    rootMatches &&
    rewardDestination === 'wallet' &&
    !Boolean(positionState?.[index]?.result) &&
    !isSelfRepayEnabled(index)
  )).length;
  const selfRepayCount = userPositions.filter((_, index) => isSelfRepayEnabled(index)).length;
  const scrollToRewards = () => document.getElementById('reward-positions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page-stack rewards-page">
      <div className="section-header reward-section-header">
        <div>
          <h1>Your CENT rewards</h1>
          <p>See what you earned, choose what should happen to it, then claim or automate it when you are ready.</p>
        </div>
        <div className="reward-header-status">
          <span className="reward-status-dot" />
          <span>{active ? 'Rewards available' : pendingForManifest ? 'Next epoch preparing' : 'Distribution updating'}</span>
        </div>
      </div>

      {manifestError ? <div className="notice reward-error">{manifestError}</div> : null}
      {error ? <div className="notice reward-error">{error}</div> : null}
      {newerEpochAvailable ? <div className="notice reward-notice">A newer reward epoch is active onchain. The published reward data is updating now.</div> : null}
      {notice ? <div className="notice reward-notice">{notice}</div> : null}

      <section className="reward-hero panel">
        <div className="reward-hero-copy">
          <span className="reward-hero-label">Current reward allocation</span>
          <strong>{formatCENT(userRewardTotalRaw)} CENT</strong>
          <p>
            {userPositions.length > 0
              ? `Across ${userPositions.length} veCENT position${userPositions.length === 1 ? '' : 's'} in the current published epoch.`
              : 'Connect a wallet with veCENT to see rewards assigned to your positions.'}
          </p>
        </div>
        <div className="reward-hero-action">
          <div className="reward-hero-meta">
            <div><span>Claimable now</span><strong>{claimableCount}</strong></div>
            <div><span>Self-repay active</span><strong>{selfRepayCount}</strong></div>
          </div>
          <button type="button" className="primary-btn" onClick={scrollToRewards}>
            {claimableCount > 0 ? 'View claimable rewards' : 'View reward positions'}
          </button>
        </div>
      </section>

      <section className="rewards-choice-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Reward behavior</h2>
              <p className="panel-copy">Choose the default destination for rewards on this device. Changing these preferences does not create a wallet transaction.</p>
            </div>
          </div>

          <div className="preference-group">
            <span className="preference-title">Where should rewards go?</span>
            <div className="preference-options" role="radiogroup" aria-label="Reward destination">
              <button type="button" className={rewardDestination === 'wallet' ? 'preference-option active' : 'preference-option'} role="radio" aria-checked={rewardDestination === 'wallet'} onClick={() => setRewardDestination('wallet')}>
                <strong>My wallet</strong>
                <span>Claim CENT directly to this wallet.</span>
              </button>
              <button type="button" className={rewardDestination === 'self-repay' ? 'preference-option active' : 'preference-option'} role="radio" aria-checked={rewardDestination === 'self-repay'} onClick={() => setRewardDestination('self-repay')}>
                <strong>Self-repay</strong>
                <span>Use eligible future rewards to repay supported debt.</span>
              </button>
            </div>
          </div>

          <div className="preference-group">
            <span className="preference-title">Claim cadence</span>
            <div className="preference-options compact" role="radiogroup" aria-label="Claim cadence">
              <button type="button" className={claimFrequency === 'epoch' ? 'preference-option active' : 'preference-option'} role="radio" aria-checked={claimFrequency === 'epoch'} onClick={() => setClaimFrequency('epoch')}>
                <strong>Every reward epoch</strong>
                <span>Review and claim when a new allocation is live.</span>
              </button>
              <button type="button" className={claimFrequency === 'weekly' ? 'preference-option active' : 'preference-option'} role="radio" aria-checked={claimFrequency === 'weekly'} onClick={() => setClaimFrequency('weekly')}>
                <strong>Weekly</strong>
                <span>Keep this as your preferred review cadence for now.</span>
              </button>
            </div>
            <p className="preference-note">Weekly is currently a preference only; it does not schedule a recurring wallet transaction.</p>
          </div>
        </div>
      </section>

      <section className="panel" id="reward-positions">
        <div className="panel-head">
          <div>
            <h2>Your reward positions</h2>
            <p className="panel-copy">Each veCENT position earns separately and keeps its own claim and self-repay state.</p>
          </div>
          {userPositions.length > 0 ? <span className="position-count">{userPositions.length} position{userPositions.length === 1 ? '' : 's'}</span> : null}
        </div>

        {!isConnected ? (
          <div className="connect-prompt">Connect your wallet to see rewards attached to your veCENT positions.</div>
        ) : userPositions.length === 0 ? (
          <div className="connect-prompt">No eligible veCENT reward position is present in the published manifest.</div>
        ) : (
          <div className="reward-position-list">
            {userPositions.map((position, index) => {
              const claimed = Boolean(positionState?.[index]?.result);
              const selfRepayEnabled = isSelfRepayEnabled(index);
              const claiming = claimingTokenId === String(position.tokenId) || isPending;
              const canClaim = !claimed && !selfRepayEnabled && rewardDestination === 'wallet' && active && rootMatches;
              const configuring = repayActionTokenId === String(position.tokenId);

              return (
                <article className="reward-position" key={position.tokenId}>
                  <div className="reward-position-main">
                    <div className="reward-position-title">
                      <span className="token cent-token">C</span>
                      <div>
                        <strong>veCENT #{position.tokenId}</strong>
                        <span>{claimed ? 'Claimed' : selfRepayEnabled ? 'Self-repay enabled' : active ? 'Ready to claim' : 'Waiting for the next active epoch'}</span>
                      </div>
                    </div>
                    <div className="reward-position-amount">
                      <strong>{formatCENT(position.amount)} CENT</strong>
                      <span>{claimed ? 'Already claimed' : active ? 'Current allocation' : 'Pending activation'}</span>
                    </div>
                  </div>

                  <div className="reward-position-actions">
                    <button type="button" className="primary-btn" disabled={!canClaim || claiming || configuring} onClick={() => claimPosition(position, index)}>
                      {selfRepayEnabled ? 'Self-repay active' : claimed ? 'Claimed' : claiming ? 'Claiming…' : rewardDestination === 'self-repay' ? 'Self-repay selected' : active ? 'Claim reward' : 'Not claimable yet'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel self-repay-section" id="self-repay">
        <div className="panel-head">
          <div>
            <h2>Make your rewards work harder</h2>
            <p className="panel-copy">Self-repay lets eligible future CENT rewards flow through Centry's debt-repayment automation instead of being sent to your wallet.</p>
          </div>
          <div className="self-repay-summary">
            <strong>{selfRepayCount}/{userPositions.length || 0}</strong>
            <span>positions enabled</span>
          </div>
        </div>

        {!isConnected ? (
          <div className="connect-prompt">Connect your wallet to configure self-repay.</div>
        ) : userPositions.length === 0 ? (
          <div className="connect-prompt">Create or connect a wallet with a veCENT position before configuring self-repay.</div>
        ) : (
          <>
            <div className="self-repay-explainer">
              <div>
                <strong>One explicit onchain action</strong>
                <span>Choosing self-repay above only changes your preference. The button below is the step that actually changes the veCENT position onchain.</span>
              </div>
              <div className="self-repay-flow">
                <span>CENT rewards</span><b>→</b><span>repayment automation</span><b>→</b><span>supported debt</span>
              </div>
            </div>

            <div className="self-repay-list">
              {userPositions.map((position, index) => {
                const selfRepayEnabled = isSelfRepayEnabled(index);
                const configuring = repayActionTokenId === String(position.tokenId);
                return (
                  <div className="self-repay-row" key={position.tokenId}>
                    <div>
                      <strong>veCENT #{position.tokenId}</strong>
                      <span>{formatCENT(position.amount)} CENT current reward allocation</span>
                    </div>
                    <div className={`self-repay-state${selfRepayEnabled ? ' active' : ''}`}>
                      <span className="self-repay-state-dot" />
                      {selfRepayEnabled ? 'Active' : 'Off'}
                    </div>
                    <button type="button" className={selfRepayEnabled ? 'secondary-btn' : 'primary-btn'} disabled={configuring || isPending} onClick={() => configureSelfRepay(position, index)}>
                      {configuring ? 'Updating…' : selfRepayEnabled ? 'Disable self-repay' : 'Enable self-repay'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <details className="panel distribution-details">
        <summary>Distribution details</summary>
        <div className="distribution-detail-grid">
          <div><span>Current epoch</span><strong>{manifest?.epoch ?? '—'}</strong></div>
          <div><span>Latest active epoch</span><strong>{latestEpoch?.toString() ?? '—'}</strong></div>
          <div><span>Reward budget</span><strong>{formatCENT(rewardBudgetRaw)} CENT</strong></div>
          <div><span>Distributed</span><strong>{formatCENT(rewardClaimedRaw)} CENT</strong></div>
          <div><span>Root status</span><strong>{epochStatus}</strong></div>
          <div><span>Timelock</span><strong>{pendingForManifest ? formatCountdown(pendingCountdown) : active ? 'Complete' : '—'}</strong></div>
        </div>
        <div className="reward-progress">
          <div className="reward-progress-head"><span>Epoch activation</span><strong>{epochFullyDistributed ? 'Complete' : active ? 'Live' : pendingForManifest ? `${progressPercent.toFixed(0)}%` : 'Waiting'}</strong></div>
          <div className="reward-progress-track">
            <div className={`reward-progress-fill ${epochFullyDistributed ? 'complete' : active ? 'complete' : pendingForManifest ? 'running' : ''}`} style={{ width: `${progressPercent}%` }} />
          </div>
          <p>{pendingForManifest ? 'The epoch has been queued and is moving through its safety delay before activation.' : epochFullyDistributed ? 'This epoch is fully distributed. The next epoch will appear after a new reward allocation is published and activated.' : active ? 'The epoch is active and rewards can be claimed.' : 'The protocol is waiting for the next distribution to be queued.'}</p>
        </div>
      </details>

      <style jsx global>{`
        .rewards-page{scroll-margin-top:20px}
        .reward-section-header{align-items:flex-start}
        .reward-header-status{display:inline-flex;align-items:center;gap:9px;align-self:flex-start;padding:11px 14px;border:1px solid #30353b;border-radius:12px;background:#101216;color:#b6bdc6;font-size:12px;font-weight:600}
        .reward-status-dot{width:8px;height:8px;border-radius:50%;background:#8d949c}
        .reward-notice,.reward-error{margin:0}
        .reward-error{border-color:#633243;background:rgba(94,30,52,.26);color:#f2a5b7}
        .reward-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:30px;padding:28px}
        .reward-hero-copy{min-width:0}
        .reward-hero-label,.preference-title{display:block;color:#9da4ad;font-size:12px}
        .reward-hero-copy>strong{display:block;margin-top:8px;font-size:clamp(42px,6vw,68px);line-height:.95;letter-spacing:-3px}
        .reward-hero-copy p{max-width:620px;margin:14px 0 0;color:#a6adb5;font-size:14px;line-height:1.6}
        .reward-hero-action{display:grid;gap:16px;min-width:290px}
        .reward-hero-action .primary-btn{width:100%}
        .reward-hero-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .reward-hero-meta>div{padding:13px 14px;border:1px solid #252a30;border-radius:11px;background:#0b0d10}
        .reward-hero-meta span,.reward-hero-meta strong{display:block}
        .reward-hero-meta span{color:#858d96;font-size:12px}
        .reward-hero-meta strong{margin-top:6px;font-size:18px}
        .rewards-choice-grid{display:grid;grid-template-columns:minmax(0,1fr)}
        .preference-group+.preference-group{margin-top:24px;padding-top:24px;border-top:1px solid #252a30}
        .preference-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
        .preference-options.compact{max-width:760px}
        .preference-option{display:grid;gap:7px;padding:15px;text-align:left;border:1px solid #292e35;border-radius:12px;background:#0c0f12;color:#a8afb8}
        .preference-option:hover{border-color:#444a52;background:#111419}
        .preference-option.active{border-color:#6a6480;background:#14151a;box-shadow:inset 0 0 0 1px #6a6480}
        .preference-option strong{color:#eef0f3;font-size:14px}
        .preference-option span{font-size:12px;line-height:1.5}
        .preference-note{margin:10px 0 0;color:#777f89;font-size:12px;line-height:1.5}
        .panel-copy{margin:7px 0 0;max-width:720px;color:#929aa3;font-size:14px;line-height:1.6}
        .position-count{color:#8d959e;font-size:12px}
        .reward-position-list{display:grid;gap:10px}
        .reward-position{padding:17px 18px;border:1px solid #292e35;border-radius:13px;background:#0c0f12}
        .reward-position-main{display:flex;align-items:center;justify-content:space-between;gap:20px}
        .reward-position-title{display:flex;align-items:center;gap:12px}
        .reward-position-title .token{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;background:#191c21;color:#d5caff;border:1px solid #3b3f46;font-weight:800}
        .reward-position-title strong,.reward-position-amount strong{display:block}
        .reward-position-title span,.reward-position-amount span{display:block;margin-top:4px;color:#838b95;font-size:12px}
        .reward-position-amount{text-align:right}
        .reward-position-amount strong{font-size:17px}
        .reward-position-actions{display:flex;justify-content:flex-end;margin-top:13px;padding-top:13px;border-top:1px solid #22272d}
        .reward-position-actions .primary-btn{min-width:170px}
        .self-repay-section{margin-top:2px}
        .self-repay-summary{display:grid;justify-items:end}
        .self-repay-summary strong{font-size:22px}
        .self-repay-summary span{margin-top:3px;color:#838b95;font-size:12px}
        .self-repay-explainer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 17px;border:1px solid #303037;border-radius:12px;background:#101216}
        .self-repay-explainer strong,.self-repay-explainer span{display:block}
        .self-repay-explainer strong{font-size:14px}
        .self-repay-explainer span{margin-top:5px;color:#89919a;font-size:12px;line-height:1.5}
        .self-repay-flow{display:flex;align-items:center;gap:9px;color:#c9c0d4;white-space:nowrap}
        .self-repay-flow span{margin:0;color:#c9c0d4;font-size:12px}
        .self-repay-flow b{color:#777f89}
        .self-repay-list{display:grid;gap:9px;margin-top:12px}
        .self-repay-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:14px;padding:14px 15px;border:1px solid #252a30;border-radius:12px;background:#0c0f12}
        .self-repay-row strong,.self-repay-row span{display:block}
        .self-repay-row strong{font-size:14px}
        .self-repay-row>div:first-child span{margin-top:4px;color:#858d96;font-size:12px}
        .self-repay-state{display:inline-flex;align-items:center;gap:7px;color:#858d96;font-size:12px;font-weight:600}
        .self-repay-state.active{color:#5bd8a0}
        .self-repay-state-dot{width:7px;height:7px;border-radius:50%;background:#666e78}
        .self-repay-state.active .self-repay-state-dot{background:#55dca1;box-shadow:0 0 9px rgba(85,220,161,.45)}
        .self-repay-row .primary-btn,.self-repay-row .secondary-btn{min-width:165px}
        .distribution-details{padding:0}
        .distribution-details summary{padding:20px 24px;cursor:pointer;list-style:none;color:#e5e8ec;font-size:15px;font-weight:650}
        .distribution-details summary::-webkit-details-marker{display:none}
        .distribution-details summary::after{content:'+';float:right;color:#838b95;font-size:20px;font-weight:400}
        .distribution-details[open] summary::after{content:'−'}
        .distribution-detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:0 24px 18px}
        .distribution-detail-grid>div{padding:13px 14px;border:1px solid #252a30;border-radius:10px;background:#0c0f12}
        .distribution-detail-grid span,.distribution-detail-grid strong{display:block}
        .distribution-detail-grid span{color:#858d96;font-size:12px}
        .distribution-detail-grid strong{margin-top:6px;font-size:14px}
        .reward-progress{margin:0 24px 24px;padding:16px;border:1px solid #252a30;border-radius:12px;background:#101216}
        .reward-progress-head{display:flex;justify-content:space-between;gap:16px;font-size:13px}
        .reward-progress-head span{color:#858d96}
        .reward-progress-head strong{font-size:12px}
        .reward-progress-track{height:6px;margin-top:12px;border-radius:999px;background:#252a30;overflow:hidden}
        .reward-progress-fill{height:100%;width:0;border-radius:999px;background:#59606a;transition:width .85s linear,background .2s ease}
        .reward-progress-fill.running{background:#aaa3bb}
        .reward-progress-fill.complete{background:#55dca1}
        .reward-progress p{margin:12px 0 0;color:#858d96;font-size:12px;line-height:1.6}
        @media (max-width:900px){
          .reward-hero{align-items:stretch;flex-direction:column}
          .reward-hero-action{min-width:0}
          .distribution-detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .self-repay-explainer{align-items:flex-start;flex-direction:column}
          .self-repay-flow{white-space:normal;flex-wrap:wrap}
        }
        @media (max-width:640px){
          .reward-header-status{display:none}
          .preference-options{grid-template-columns:1fr}
          .reward-position-main{align-items:flex-start;flex-direction:column}
          .reward-position-amount{text-align:left}
          .reward-position-actions{justify-content:stretch}
          .reward-position-actions .primary-btn{width:100%}
          .self-repay-summary{justify-items:start}
          .self-repay-row{grid-template-columns:1fr}
          .self-repay-row .primary-btn,.self-repay-row .secondary-btn{width:100%}
          .distribution-detail-grid{grid-template-columns:1fr}
          .distribution-details summary{padding:18px}
          .reward-progress{margin:0 18px 18px}
          .distribution-detail-grid{padding:0 18px 14px}
        }
      `}</style>
    </div>
  );
}
