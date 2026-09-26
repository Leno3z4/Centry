'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, usePublicClient, useSignMessage, useSendTransaction, useWriteContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../../components/Providers';
import { AppShell } from '../../../../components/AppShell';
import WalletAssetDropdown from '../WalletAssetDropdown';
import { CONTRACT_ADDRESSES } from '../../../../constants/contracts';
import { ORACLE_ABI } from '../../../../constants/abis';
import styles from '../agents.module.css';
import AgentNetworkPanel from '../../../../components/AgentNetworkPanel';
import {
  ACCOUNT_ABI,
  API_BASE,
  WITHDRAWABLE_ASSETS,
  apiJson,
  loadOwnedAgents,
  ensureOwnerSession,
  shortAddress,
} from '../agentClient';

const AGENT_WALLET_ASSETS = Object.freeze(
  WITHDRAWABLE_ASSETS.filter((item) => item.key !== 'cent'),
);

const PORTFOLIO_COLORS = Object.freeze({
  native: '#4f8cff',
  eurc: '#33c3a6',
  cirbtc: '#f97316',
});

function formatAssetAmount(raw, decimals) {
  try {
    const formatted = formatUnits(BigInt(raw || '0'), decimals);
    const [whole, fraction = ''] = formatted.split('.');
    const trimmed = fraction.slice(0, 8).replace(/0+$/, '');
    return trimmed ? `${whole}.${trimmed}` : whole;
  } catch {
    return '0';
  }
}

function formatUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '$0.00';
  if (number < 0.01) return '<$0.01';
  return number.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function runtimeTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function runtimeStatusLabel(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'running') return 'ACTIVE';
  if (normalized === 'executed') return 'ACTION CONFIRMED';
  if (normalized === 'failed') return 'FAILED';
  if (normalized === 'waiting_provider') return 'WAITING FOR PROVIDER';
  if (normalized === 'skipped') return 'SKIPPED';
  if (normalized === 'locked') return 'BUSY';
  if (normalized === 'processed') return 'EVALUATED';
  return normalized ? normalized.toUpperCase() : 'NO RUN YET';
}

function getRuntimeAlert(runtime) {
  if (!runtime) {
    return { tone: 'runtimeAlertInfo', label: 'Runtime check', title: 'Checking agent runtime', message: 'The latest runner state is being checked.' };
  }

  const run = runtime.recentRuns?.[0];
  if (!run) {
    return { tone: 'runtimeAlertInfo', label: 'No wake recorded', title: 'No runner wake has been recorded yet', message: 'There is no recorded runner wake available for this agent yet.' };
  }

  const reason = String(run.reason || '').trim();
  const error = String(run.error || '').trim();
  const status = String(run.status || '').toLowerCase();

  if (error || status === 'failed') {
    return {
      tone: 'runtimeAlertDanger',
      label: 'Attention',
      title: 'The latest runner wake did not complete',
      message: error || reason || 'The runner reported a failed wake.',
    };
  }

  if (status === 'skipped' || status === 'waiting_provider' || /idle|minimum|threshold|balance/i.test(reason)) {
    return {
      tone: 'runtimeAlertWarning',
      label: 'Runtime notice',
      title: 'The latest wake did not execute an action',
      message: reason || `Runner status: ${runtimeStatusLabel(run.status)}.`,
    };
  }

  return {
    tone: 'runtimeAlertInfo',
    label: 'Latest wake',
    title: `${runtimeStatusLabel(run.status)} · ${runtimeTime(run.started_at)}`,
    message: reason || 'The runner completed its latest wake without an additional note.',
  };
}

function getHealthWarning(runtime) {
  const raw = runtime?.executionRuntime?.strategy_state_json;
  if (!raw) return { active: false, level: 'unknown', message: '', healthFactor: null, checkedAt: null };
  try {
    const state = JSON.parse(raw);
    const warning = state?.healthWarning;
    if (!warning || typeof warning !== 'object') {
      return { active: false, level: 'unknown', message: '', healthFactor: null, checkedAt: null };
    }
    return {
      active: Boolean(warning.active),
      level: String(warning.level || 'unknown'),
      message: String(warning.message || ''),
      healthFactor: warning.healthFactor ? (() => {
        try { return formatUnits(BigInt(warning.healthFactor), 18); } catch { return null; }
      })() : null,
      checkedAt: warning.checkedAt || null,
    };
  } catch {
    return { active: false, level: 'unknown', message: '', healthFactor: null, checkedAt: null };
  }
}

function DashboardContent() {
  const { account } = useParams();
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync, isPending } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [agents, setAgents] = useState([]);
  const [agent, setAgent] = useState(null);
  const [activity, setActivity] = useState([]);
  const [balances, setBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [runtime, setRuntime] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [asset, setAsset] = useState('native');
  const [amount, setAmount] = useState('');

  async function loadRuntimeStatus() {
    if (!address || !agent) return;
    try {
      await ensureOwnerSession({ address, account: agent.account, signMessageAsync });
      const result = await apiJson(`${API_BASE}/api/v1/agents/${agent.id}/runtime`, {
        method: 'GET',
      });
      setRuntime(result);
    } catch (error) {
      setRuntime(null);
      throw error;
    }
  }

  async function refresh() {
    if (!address || !publicClient) return;
    const next = await loadOwnedAgents({ address, publicClient });
    setAgents(next);
    const selected = next.find((item) => item.account.toLowerCase() === String(account).toLowerCase());
    setAgent(selected || null);
    if (!selected && next[0]) router.replace(`/app/agents/${next[0].account}`);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [address, publicClient, account]);

  useEffect(() => {
    loadBalances();
  }, [publicClient, account]);

  useEffect(() => {
    if (!agent) return;
    let cancelled = false;
    const refreshRuntime = () => loadRuntimeStatus().catch(() => {});
    refreshRuntime();
    const timer = window.setInterval(() => {
      if (!cancelled) refreshRuntime();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agent?.id, address]);

  async function toggleActive() {
    setError(''); setStatus('');
    const nextActive = !agent.active;
    try {
      setStatus(nextActive ? 'Activating agent…' : 'Pausing agent…');
      const hash = await writeContractAsync({
        address: agent.account,
        abi: ACCOUNT_ABI,
        functionName: 'setActive',
        args: [nextActive],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const liveActive = await publicClient.readContract({
        address: agent.account,
        abi: ACCOUNT_ABI,
        functionName: 'active',
      });

      await refresh();
      setStatus(liveActive ? 'Agent activated.' : 'Agent paused.');
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Agent state change failed.');
      setStatus('');
    }
  }

  async function loadActivity() {
    setError('');
    try {
      await ensureOwnerSession({ address, account: agent.account, signMessageAsync });
      const result = await apiJson(`${API_BASE}/api/v1/agents/${agent.id}/activity`, { method: 'POST', headers: { 'content-type': 'application/json' } });
      setActivity(result.activity || []);
    } catch (e) { setError(e.message); }
  }

  async function loadBalances() {
    if (!publicClient || !account) return;
    setBalancesLoading(true);
    try {
      const rows = await Promise.all(
        AGENT_WALLET_ASSETS.map(async (asset) => {
          const oracleAsset = asset.address || CONTRACT_ADDRESSES.USDC;
          const raw = asset.address
            ? await publicClient.readContract({
                address: asset.address,
                abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
                functionName: 'balanceOf',
                args: [account],
              })
            : await publicClient.getBalance({ address: account });

          const rawBalance = BigInt(raw || 0n);
          let priceRaw = 0n;
          let updatedAt = 0n;

          try {
            const priceResult = await publicClient.readContract({
              address: CONTRACT_ADDRESSES.oracle,
              abi: ORACLE_ABI,
              functionName: 'getPrice',
              args: [oracleAsset],
            });
            [priceRaw, updatedAt] = Array.isArray(priceResult) ? priceResult : [priceResult, 0n];
          } catch {
            // Some supported assets may not have a USD feed in the deployed oracle yet.
          }

          const usdRaw = priceRaw > 0n ? (rawBalance * BigInt(priceRaw)) / (10n ** BigInt(asset.decimals)) : null;
          const usdValue = usdRaw == null ? null : Number(formatUnits(usdRaw, 18));

          return {
            ...asset,
            raw: rawBalance.toString(),
            priceRaw: String(priceRaw),
            updatedAt: String(updatedAt || 0n),
            usdRaw: usdRaw == null ? null : usdRaw.toString(),
            usdValue: Number.isFinite(usdValue) ? usdValue : null,
            color: PORTFOLIO_COLORS[asset.key] || '#73767d',
          };
        }),
      );
      setBalances(rows);
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Agent balances could not be loaded.');
    } finally {
      setBalancesLoading(false);
    }
  }

  async function fundAgent() {
    const selected = AGENT_WALLET_ASSETS.find((item) => item.key === asset);
    if (!selected || !amount || Number(amount) <= 0) return setError('Enter a valid funding amount.');
    try {
      setStatus('Preparing funding… Approve the wallet transaction.');
      const raw = parseUnits(amount, selected.decimals);
      const hash = selected.address ? await writeContractAsync({ address: selected.address, abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }], functionName: 'transfer', args: [agent.account, raw] }) : await sendTransactionAsync({ to: agent.account, value: raw, chainId: 5042 });
      await publicClient.waitForTransactionReceipt({ hash }); setAmount(''); setStatus(`${selected.label} funded.`); await loadBalances();
    } catch (e) { setError(e?.shortMessage || e?.message || 'Funding failed.'); setStatus(''); }
  }

  async function withdrawAgent() {
    const selected = AGENT_WALLET_ASSETS.find((item) => item.key === asset);
    if (!selected || !amount || Number(amount) <= 0) return setError('Enter a valid withdrawal amount.');
    try {
      setStatus('Preparing withdrawal… Approve the wallet transaction.');
      const raw = parseUnits(amount, selected.decimals);
      const hash = selected.address ? await writeContractAsync({ address: agent.account, abi: ACCOUNT_ABI, functionName: 'withdrawToken', args: [selected.address, raw] }) : await writeContractAsync({ address: agent.account, abi: ACCOUNT_ABI, functionName: 'withdrawNative', args: [raw] });
      await publicClient.waitForTransactionReceipt({ hash }); setAmount(''); setStatus(`${selected.label} withdrawn to your wallet.`); await loadBalances();
    } catch (e) { setError(e?.shortMessage || e?.message || 'Withdrawal failed.'); setStatus(''); }
  }

  const recent = useMemo(() => activity.slice(0, 5), [activity]);
  const runtimeAlert = getRuntimeAlert(runtime);

  const automation = useMemo(() => {
    if (!runtime) return { label: 'Checking…', tone: 'statusMuted' };
    if (!runtime.runnerConfigured) return { label: 'Runner missing', tone: 'statusWarning' };
    if (runtime.operatorAuthorized === false) return { label: 'Not authorized', tone: 'statusDanger' };
    if (!runtime.providerConfigured) return { label: 'Provider missing', tone: 'statusWarning' };
    if (!runtime.autonomyEnabled) return { label: 'Autonomy off', tone: 'statusMuted' };
    return { label: 'Ready', tone: 'statusReady' };
  }, [runtime]);

  const portfolio = useMemo(() => {
    const totalUsd = balances.reduce((sum, item) => sum + (Number.isFinite(item.usdValue) ? item.usdValue : 0), 0);
    const rows = balances.map((item) => ({
      ...item,
      percentage: totalUsd > 0 && Number.isFinite(item.usdValue) ? (item.usdValue / totalUsd) * 100 : 0,
    }));
    const activeRows = rows.filter((item) => Number.isFinite(item.usdValue) && item.usdValue > 0);
    return { totalUsd, rows, activeRows };
  }, [balances]);

  if (!isConnected) return <div className={styles.emptyState}><h1>Connect your wallet</h1><p>Your agent dashboard is tied to the wallet that owns the smart account.</p></div>;
  if (!agent) return <div className={styles.emptyState}><p>Loading agent…</p></div>;

  return (
    <main className={styles.page}>
      <header className={styles.dashboardHeader}>
        <div className={styles.headerCopy}>
          <div className={styles.kicker}>Agent dashboard</div>
          <h1>{agent.name}</h1>
          <p>{agent.description || 'Configurable Centry onchain agent.'}</p>
        </div>
        <div className={styles.headerActions} aria-label="Agent actions">
          <button className={styles.toggleButton} disabled={isPending} onClick={toggleActive}>
            {agent.active ? 'Pause agent' : 'Activate agent'}
          </button>
          <Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/configure`}>Configure</Link>
          <Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/chat`}>Chat</Link>
        </div>
      </header>
      {agents.length > 1 ? <div className={styles.agentSwitcher}><span>Agent</span><select className={styles.input} value={agent.account} onChange={(e) => router.push(`/app/agents/${e.target.value}`)}>{agents.map((item) => <option key={item.account} value={item.account}>{item.name} · {shortAddress(item.account)}</option>)}</select></div> : null}
      {status ? <div className={styles.notice}>{status}</div> : null}{error ? <div className={styles.error}>{error}</div> : null}
      <section className={styles.analyticsHero}><div><span className={agent.active ? styles.statusOn : styles.statusOff}>{agent.active ? 'ACTIVE' : 'OFF'}</span><h2>Agent analytics</h2><p>Monitor this agent here. Configuration and conversation live on their own pages so the dashboard stays focused.</p></div><div className={styles.addressPanel}><span>Smart account</span><code>{agent.account}</code><button type="button" className={styles.textButton} onClick={() => navigator.clipboard.writeText(agent.account)}>Copy address</button></div></section>
      <section className={styles.runtimeBox}>
        <div className={styles.runtimeBoxHead}>
          <div>
            <span className={styles.proofKicker}>Agent heartbeat &amp; performance</span>
            <h2>Runtime at a glance</h2>
            <p>Wake history, automation state, health warnings, and execution proof in one place.</p>
          </div>
          <span className={[styles.statusBadge, agent.active ? styles.statusRunning : styles.statusMuted].join(' ')}>
            {agent.active ? 'Running' : 'Paused'}
          </span>
        </div>

        {healthWarning.active ? (
          <div className={[
            styles.healthWarning,
            healthWarning.level === 'liquidation' ? styles.healthWarningDanger : styles.healthWarningWarning,
          ].join(' ')} role="alert">
            <span className={styles.healthWarningIcon} aria-hidden="true">!</span>
            <div>
              <strong>
                {healthWarning.level === 'liquidation' ? 'Liquidation risk' : healthWarning.level === 'critical' ? 'Critical health warning' : 'Health warning'}
              </strong>
              <p>{healthWarning.message}</p>
              {healthWarning.healthFactor ? <small>Health factor {healthWarning.healthFactor} · checked {runtimeTime(healthWarning.checkedAt)}</small> : null}
            </div>
          </div>
        ) : null}

        {(runtimeAlert.tone === 'runtimeAlertDanger') ? (
          <div className={styles.runtimeEventDanger} role="alert">
            <strong>{runtimeAlert.title}</strong>
            <span>{runtimeAlert.message}</span>
          </div>
        ) : null}

        <div className={styles.runtimeSummaryGrid}>
          <div>
            <span>Status</span>
            <strong className={[styles.statusBadge, agent.active ? styles.statusRunning : styles.statusMuted].join(' ')}>
              {agent.active ? 'Running' : 'Paused'}
            </strong>
          </div>
          <div>
            <span>Automation</span>
            <strong className={[styles.statusBadge, styles[automation.tone]].join(' ')}>{automation.label}</strong>
          </div>
          <div>
            <span>Recent events</span>
            <strong>{activity.length}</strong>
          </div>
          <div>
            <span>Last wake</span>
            <strong>{runtime?.recentRuns?.[0] ? runtimeTime(runtime.recentRuns[0].started_at) : '—'}</strong>
            <small>{runtime?.recentRuns?.[0]?.status ? runtimeStatusLabel(runtime.recentRuns[0].status) : 'No wake recorded'}</small>
          </div>
        </div>

        <div className={styles.runtimeEventRow}>
          <div>
            <span>Event</span>
            <strong>
              {runtime?.recentRuns?.[0]
                ? (runtime.recentRuns[0].error || runtime.recentRuns[0].reason || runtimeStatusLabel(runtime.recentRuns[0].status))
                : 'No runner event recorded'}
            </strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{runtime?.recentRuns?.[0] ? runtimeStatusLabel(runtime.recentRuns[0].status) : 'NO RUN YET'}</strong>
          </div>
        </div>

        <div className={styles.executionProofInline}>
          <div>
            <span>Heartbeat</span>
            <strong>{runtimeTime(runtime?.executionRuntime?.heartbeat_at)}</strong>
          </div>
          <div>
            <span>Evaluation</span>
            <strong>{runtimeTime(runtime?.executionRuntime?.last_evaluation_at)}</strong>
          </div>
          <div>
            <span>Result</span>
            <strong>{runtimeStatusLabel(runtime?.executionRuntime?.last_status)}</strong>
          </div>
          <div>
            <span>Transaction</span>
            <strong>{runtime?.executionRuntime?.last_tx_hash ? runtime.executionRuntime.last_tx_hash : '—'}</strong>
          </div>
        </div>
      </section>

      <AgentNetworkPanel agent={agent} />

      <section className={styles.analyticsGrid}>
        <section className={styles.card}>
          <div className={styles.sectionHead}>
            <div>
              <h2>Recent activity</h2>
              <p>Load the verified onchain activity when you want to inspect what this agent has done.</p>
            </div>
            <button className={styles.secondaryButton} onClick={loadActivity}>Load activity</button>
          </div>
          <div className={styles.activityList}>{recent.length ? recent.map((item, index) => <div className={styles.activity} key={`${item.transactionHash}-${index}`}><div><strong>{item.type}</strong><span>Block {item.blockNumber}</span></div><code>{item.transactionHash}</code></div>) : <div className={styles.empty}>No activity loaded yet.</div>}</div>
        </section>

        <section className={styles.portfolioCard}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionKicker}>Wallet allocation</span>
              <h2>Portfolio</h2>
              <p>USD-weighted balances held by this agent smart account.</p>
            </div>
            <div className={styles.portfolioHeaderActions}>
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => { setFundOpen((value) => !value); setWithdrawOpen(false); }}
                aria-expanded={fundOpen}
              >
                Fund agent
              </button>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => { setWithdrawOpen((value) => !value); setFundOpen(false); }}
                aria-expanded={withdrawOpen}
              >
                Withdraw
              </button>
              <button className={styles.iconButton} type="button" onClick={loadBalances} disabled={balancesLoading} aria-label="Refresh portfolio">
                {balancesLoading ? '…' : '↻'}
              </button>
            </div>
          </div>

          <div className={styles.portfolioBody}>
            <div className={styles.portfolioTotal}>
              <span>Total balance</span>
              <strong>{formatUsd(portfolio.totalUsd)}</strong>
            </div>

            <div className={styles.portfolioSegmentBar} role="img" aria-label="Portfolio allocation by USD value">
              {portfolio.activeRows.length ? portfolio.activeRows.map((item) => (
                <span
                  key={item.key}
                  title={item.label + ': ' + item.percentage.toFixed(1) + '%'}
                  style={{ width: Math.max(item.percentage, 0) + '%', background: item.color }}
                />
              )) : <span className={styles.portfolioSegmentEmpty} />}
            </div>

            <div className={styles.portfolioLegend}>
              {portfolio.rows.map((item) => (
                <div className={styles.portfolioLegendRow} key={item.key}>
                  <div className={styles.portfolioAsset}>
                    <span className={styles.portfolioDot} style={{ background: item.color }} />
                    <div>
                      <strong>{item.label}</strong>
                      <span>{formatAssetAmount(item.raw, item.decimals)} {item.label}</span>
                    </div>
                  </div>
                  <div className={styles.portfolioValue}>
                    <strong>{item.usdValue == null ? '—' : formatUsd(item.usdValue)}</strong>
                    <span>{item.percentage.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(fundOpen || withdrawOpen) ? (
            <div className={styles.inlineAction}>
              <WalletAssetDropdown value={asset} assets={AGENT_WALLET_ASSETS} onChange={setAsset} />
              <input
                className={styles.input}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              <button className={styles.primaryButton} onClick={fundOpen ? fundAgent : withdrawAgent}>
                {fundOpen ? 'Fund agent' : 'Withdraw'}
              </button>
            </div>
          ) : null}

          <div className={styles.portfolioMeta}>
            <span>Segment widths use only assets with an available USD price feed.</span>
          </div>
        </section>
      </section>

    </main>
  );
}

export default function AgentDashboardPage() { return <Providers><AppShell><DashboardContent /></AppShell></Providers>; }
