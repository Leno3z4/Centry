'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, usePublicClient, useSignMessage, useSendTransaction, useWriteContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../../components/Providers';
import { AppShell } from '../../../../components/AppShell';
import { CONTRACT_ADDRESSES } from '../../../../constants/contracts';
import { ORACLE_ABI } from '../../../../constants/abis';
import styles from '../agents.module.css';
import {
  ACCOUNT_ABI,
  API_BASE,
  WITHDRAWABLE_ASSETS,
  apiJson,
  loadOwnedAgents,
  ensureOwnerSession,
  shortAddress,
} from '../agentClient';

const PORTFOLIO_COLORS = Object.freeze({
  native: '#4f8cff',
  cent: '#f59e0b',
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

function WalletAssetDropdown({ value, assets, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = assets.find((item) => item.key === value) || assets[0];

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div className={styles.walletAssetPicker} ref={rootRef}>
      <button
        type="button"
        className={`${styles.walletAssetTrigger} ${open ? styles.walletAssetTriggerOpen : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={styles.walletAssetSelected}>
          <span className={`${styles.walletAssetIcon} ${styles[`walletAssetIcon_${selected?.key || 'native'}`]} `}>
            {selected?.key === 'cirbtc' ? '₿' : selected?.key === 'eurc' ? '€' : selected?.key === 'cent' ? 'C' : '
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
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [asset, setAsset] = useState('native');
  const [amount, setAmount] = useState('');

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
        WITHDRAWABLE_ASSETS.map(async (asset) => {
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
    const selected = WITHDRAWABLE_ASSETS.find((item) => item.key === asset);
    if (!selected || !amount || Number(amount) <= 0) return setError('Enter a valid funding amount.');
    try {
      setStatus('Preparing funding… Approve the wallet transaction.');
      const raw = parseUnits(amount, selected.decimals);
      const hash = selected.address ? await writeContractAsync({ address: selected.address, abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }], functionName: 'transfer', args: [agent.account, raw] }) : await sendTransactionAsync({ to: agent.account, value: raw, chainId: 5042 });
      await publicClient.waitForTransactionReceipt({ hash }); setAmount(''); setStatus(`${selected.label} funded.`); await loadBalances();
    } catch (e) { setError(e?.shortMessage || e?.message || 'Funding failed.'); setStatus(''); }
  }

  async function withdrawAgent() {
    const selected = WITHDRAWABLE_ASSETS.find((item) => item.key === asset);
    if (!selected || !amount || Number(amount) <= 0) return setError('Enter a valid withdrawal amount.');
    try {
      setStatus('Preparing withdrawal… Approve the wallet transaction.');
      const raw = parseUnits(amount, selected.decimals);
      const hash = selected.address ? await writeContractAsync({ address: agent.account, abi: ACCOUNT_ABI, functionName: 'withdrawToken', args: [selected.address, raw] }) : await writeContractAsync({ address: agent.account, abi: ACCOUNT_ABI, functionName: 'withdrawNative', args: [raw] });
      await publicClient.waitForTransactionReceipt({ hash }); setAmount(''); setStatus(`${selected.label} withdrawn to your wallet.`); await loadBalances();
    } catch (e) { setError(e?.shortMessage || e?.message || 'Withdrawal failed.'); setStatus(''); }
  }

  const recent = useMemo(() => activity.slice(0, 5), [activity]);

  const portfolio = useMemo(() => {
    const totalUsd = balances.reduce((sum, item) => sum + (Number.isFinite(item.usdValue) ? item.usdValue : 0), 0);
    const rows = balances.map((item) => ({
      ...item,
      percentage: totalUsd > 0 && Number.isFinite(item.usdValue) ? (item.usdValue / totalUsd) * 100 : 0,
    }));
    const activeRows = rows.filter((item) => Number.isFinite(item.usdValue) && item.usdValue > 0);
    return { totalUsd, rows, activeRows };
  }, [balances]);

  const portfolioGradient = useMemo(() => {
    if (!portfolio.activeRows.length) return 'conic-gradient(#2b2d31 0 100%)';
    let cursor = 0;
    const segments = portfolio.activeRows.map((item) => {
      const start = cursor;
      cursor += item.percentage;
      return `${item.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  }, [portfolio.activeRows]);

  if (!isConnected) return <div className={styles.emptyState}><h1>Connect your wallet</h1><p>Your agent dashboard is tied to the wallet that owns the smart account.</p></div>;
  if (!agent) return <div className={styles.emptyState}><p>Loading agent…</p></div>;

  return (
    <main className={styles.page}>
      <header className={styles.dashboardHeader}><div><div className={styles.kicker}>Agent dashboard</div><h1>{agent.name}</h1><p>{agent.description || 'Configurable Centry onchain agent.'}</p></div><div className={styles.headerActions}><Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/configure`}>Configure</Link><Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/chat`}>Chat</Link><button className={styles.toggleButton} disabled={isPending} onClick={toggleActive}>{agent.active ? 'Pause agent' : 'Activate agent'}</button></div></header>
      {agents.length > 1 ? <div className={styles.agentSwitcher}><span>Agent</span><select className={styles.input} value={agent.account} onChange={(e) => router.push(`/app/agents/${e.target.value}`)}>{agents.map((item) => <option key={item.account} value={item.account}>{item.name} · {shortAddress(item.account)}</option>)}</select></div> : null}
      {status ? <div className={styles.notice}>{status}</div> : null}{error ? <div className={styles.error}>{error}</div> : null}
      <section className={styles.analyticsHero}><div><span className={agent.active ? styles.statusOn : styles.statusOff}>{agent.active ? 'ACTIVE' : 'OFF'}</span><h2>Agent analytics</h2><p>Monitor this agent here. Configuration and conversation live on their own pages so the dashboard stays focused.</p></div><div className={styles.addressPanel}><span>Smart account</span><code>{agent.account}</code><button type="button" className={styles.textButton} onClick={() => navigator.clipboard.writeText(agent.account)}>Copy address</button></div></section>
      <section className={styles.statsLarge}><div><span>Status</span><strong>{agent.active ? 'Running' : 'Paused'}</strong></div><div><span>Type</span><strong>{agent.registered === false ? 'Unregistered' : 'Centry agent'}</strong></div><div><span>Recent events</span><strong>{activity.length}</strong></div></section>

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
              <h2>Portfolio</h2>
              <p>USD-weighted balances held by this agent smart account.</p>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={loadBalances} disabled={balancesLoading}>
              {balancesLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className={styles.portfolioBody}>
            <div className={styles.pieWrap}>
              <div className={styles.portfolioPie} style={{ background: portfolioGradient }} aria-label={`Agent portfolio total ${formatUsd(portfolio.totalUsd)}`}>
                <div className={styles.pieCenter}>
                  <strong>{formatUsd(portfolio.totalUsd)}</strong>
                  <span>Total value</span>
                </div>
              </div>
            </div>

            <div className={styles.portfolioLegend}>
              {portfolio.rows.map((item) => (
                <div className={styles.portfolioRow} key={item.key}>
                  <div className={styles.portfolioAsset}>
                    <span className={styles.portfolioDot} style={{ background: item.color }} />
                    <div><strong>{item.key === 'native' ? 'USDC' : item.label}</strong><span>{formatAssetAmount(item.raw, item.decimals)}</span></div>
                  </div>
                  <div className={styles.portfolioValue}>
                    <strong>{formatUsd(item.usdValue)}</strong>
                    <span>{item.usdValue == null ? 'No USD feed' : item.percentage > 0 ? `${item.percentage < 10 ? item.percentage.toFixed(1) : item.percentage.toFixed(0)}%` : '0%'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.portfolioMeta}>
            <span>Pie share uses only assets with an available USD price feed.</span>
          </div>
        </section>
      </section>

      <section className={styles.quickLinks}>
        <button
          type="button"
          className={styles.quickCard}
          onClick={() => { setFundOpen((value) => !value); setWithdrawOpen(false); }}
          aria-expanded={fundOpen}
        >
          <strong>Fund agent</strong>
          <span>Add supported assets to the agent smart account.</span>
        </button>
        <button
          type="button"
          className={styles.quickCard}
          onClick={() => { setWithdrawOpen((value) => !value); setFundOpen(false); }}
          aria-expanded={withdrawOpen}
        >
          <strong>Withdraw</strong>
          <span>Move supported assets from the agent back to your wallet.</span>
        </button>
        {fundOpen || withdrawOpen ? (
          <div className={styles.inlineAction}>
            <WalletAssetDropdown value={asset} assets={WITHDRAWABLE_ASSETS} onChange={setAsset} />
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
      </section>
    </main>
  );
}

export default function AgentDashboardPage() { return <Providers><AppShell><DashboardContent /></AppShell></Providers>; }
}
          </span>
          <span>
            <strong>{selected?.key === 'native' ? 'USDC' : selected?.label || 'Asset'}</strong>
            <small>{selected?.key === 'native' ? 'Arc native' : selected?.label || ''}</small>
          </span>
        </span>
        <span className={`${styles.walletAssetChevron} ${open ? styles.walletAssetChevronOpen : ''}`}>⌄</span>
      </button>

      {open ? (
        <div className={styles.walletAssetMenu} role="listbox" aria-label="Funding asset">
          {assets.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={item.key === value}
              key={item.key}
              className={`${styles.walletAssetOption} ${item.key === value ? styles.walletAssetOptionActive : ''}`}
              onClick={() => {
                onChange(item.key);
                setOpen(false);
              }}
            >
              <span className={`${styles.walletAssetIcon} ${styles[`walletAssetIcon_${item.key}`]} `}>
                {item.key === 'cirbtc' ? '₿' : item.key === 'eurc' ? '€' : item.key === 'cent' ? 'C' : '
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
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [asset, setAsset] = useState('native');
  const [amount, setAmount] = useState('');

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
        WITHDRAWABLE_ASSETS.map(async (asset) => {
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
    const selected = WITHDRAWABLE_ASSETS.find((item) => item.key === asset);
    if (!selected || !amount || Number(amount) <= 0) return setError('Enter a valid funding amount.');
    try {
      setStatus('Preparing funding… Approve the wallet transaction.');
      const raw = parseUnits(amount, selected.decimals);
      const hash = selected.address ? await writeContractAsync({ address: selected.address, abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }], functionName: 'transfer', args: [agent.account, raw] }) : await sendTransactionAsync({ to: agent.account, value: raw, chainId: 5042 });
      await publicClient.waitForTransactionReceipt({ hash }); setAmount(''); setStatus(`${selected.label} funded.`); await loadBalances();
    } catch (e) { setError(e?.shortMessage || e?.message || 'Funding failed.'); setStatus(''); }
  }

  async function withdrawAgent() {
    const selected = WITHDRAWABLE_ASSETS.find((item) => item.key === asset);
    if (!selected || !amount || Number(amount) <= 0) return setError('Enter a valid withdrawal amount.');
    try {
      setStatus('Preparing withdrawal… Approve the wallet transaction.');
      const raw = parseUnits(amount, selected.decimals);
      const hash = selected.address ? await writeContractAsync({ address: agent.account, abi: ACCOUNT_ABI, functionName: 'withdrawToken', args: [selected.address, raw] }) : await writeContractAsync({ address: agent.account, abi: ACCOUNT_ABI, functionName: 'withdrawNative', args: [raw] });
      await publicClient.waitForTransactionReceipt({ hash }); setAmount(''); setStatus(`${selected.label} withdrawn to your wallet.`); await loadBalances();
    } catch (e) { setError(e?.shortMessage || e?.message || 'Withdrawal failed.'); setStatus(''); }
  }

  const recent = useMemo(() => activity.slice(0, 5), [activity]);

  const portfolio = useMemo(() => {
    const totalUsd = balances.reduce((sum, item) => sum + (Number.isFinite(item.usdValue) ? item.usdValue : 0), 0);
    const rows = balances.map((item) => ({
      ...item,
      percentage: totalUsd > 0 && Number.isFinite(item.usdValue) ? (item.usdValue / totalUsd) * 100 : 0,
    }));
    const activeRows = rows.filter((item) => Number.isFinite(item.usdValue) && item.usdValue > 0);
    return { totalUsd, rows, activeRows };
  }, [balances]);

  const portfolioGradient = useMemo(() => {
    if (!portfolio.activeRows.length) return 'conic-gradient(#2b2d31 0 100%)';
    let cursor = 0;
    const segments = portfolio.activeRows.map((item) => {
      const start = cursor;
      cursor += item.percentage;
      return `${item.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  }, [portfolio.activeRows]);

  if (!isConnected) return <div className={styles.emptyState}><h1>Connect your wallet</h1><p>Your agent dashboard is tied to the wallet that owns the smart account.</p></div>;
  if (!agent) return <div className={styles.emptyState}><p>Loading agent…</p></div>;

  return (
    <main className={styles.page}>
      <header className={styles.dashboardHeader}><div><div className={styles.kicker}>Agent dashboard</div><h1>{agent.name}</h1><p>{agent.description || 'Configurable Centry onchain agent.'}</p></div><div className={styles.headerActions}><Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/configure`}>Configure</Link><Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/chat`}>Chat</Link><button className={styles.toggleButton} disabled={isPending} onClick={toggleActive}>{agent.active ? 'Pause agent' : 'Activate agent'}</button></div></header>
      {agents.length > 1 ? <div className={styles.agentSwitcher}><span>Agent</span><select className={styles.input} value={agent.account} onChange={(e) => router.push(`/app/agents/${e.target.value}`)}>{agents.map((item) => <option key={item.account} value={item.account}>{item.name} · {shortAddress(item.account)}</option>)}</select></div> : null}
      {status ? <div className={styles.notice}>{status}</div> : null}{error ? <div className={styles.error}>{error}</div> : null}
      <section className={styles.analyticsHero}><div><span className={agent.active ? styles.statusOn : styles.statusOff}>{agent.active ? 'ACTIVE' : 'OFF'}</span><h2>Agent analytics</h2><p>Monitor this agent here. Configuration and conversation live on their own pages so the dashboard stays focused.</p></div><div className={styles.addressPanel}><span>Smart account</span><code>{agent.account}</code><button type="button" className={styles.textButton} onClick={() => navigator.clipboard.writeText(agent.account)}>Copy address</button></div></section>
      <section className={styles.statsLarge}><div><span>Status</span><strong>{agent.active ? 'Running' : 'Paused'}</strong></div><div><span>Type</span><strong>{agent.registered === false ? 'Unregistered' : 'Centry agent'}</strong></div><div><span>Recent events</span><strong>{activity.length}</strong></div></section>

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
              <h2>Portfolio</h2>
              <p>USD-weighted balances held by this agent smart account.</p>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={loadBalances} disabled={balancesLoading}>
              {balancesLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className={styles.portfolioBody}>
            <div className={styles.pieWrap}>
              <div className={styles.portfolioPie} style={{ background: portfolioGradient }} aria-label={`Agent portfolio total ${formatUsd(portfolio.totalUsd)}`}>
                <div className={styles.pieCenter}>
                  <strong>{formatUsd(portfolio.totalUsd)}</strong>
                  <span>Total value</span>
                </div>
              </div>
            </div>

            <div className={styles.portfolioLegend}>
              {portfolio.rows.map((item) => (
                <div className={styles.portfolioRow} key={item.key}>
                  <div className={styles.portfolioAsset}>
                    <span className={styles.portfolioDot} style={{ background: item.color }} />
                    <div><strong>{item.key === 'native' ? 'USDC' : item.label}</strong><span>{formatAssetAmount(item.raw, item.decimals)}</span></div>
                  </div>
                  <div className={styles.portfolioValue}>
                    <strong>{formatUsd(item.usdValue)}</strong>
                    <span>{item.usdValue == null ? 'No USD feed' : item.percentage > 0 ? `${item.percentage < 10 ? item.percentage.toFixed(1) : item.percentage.toFixed(0)}%` : '0%'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.portfolioMeta}>
            <span>Pie share uses only assets with an available USD price feed.</span>
          </div>
        </section>
      </section>

      <section className={styles.quickLinks}>
        <button
          type="button"
          className={styles.quickCard}
          onClick={() => { setFundOpen((value) => !value); setWithdrawOpen(false); }}
          aria-expanded={fundOpen}
        >
          <strong>Fund agent</strong>
          <span>Add supported assets to the agent smart account.</span>
        </button>
        <button
          type="button"
          className={styles.quickCard}
          onClick={() => { setWithdrawOpen((value) => !value); setFundOpen(false); }}
          aria-expanded={withdrawOpen}
        >
          <strong>Withdraw</strong>
          <span>Move supported assets from the agent back to your wallet.</span>
        </button>
        {fundOpen || withdrawOpen ? (
          <div className={styles.inlineAction}>
            <select className={styles.input} value={asset} onChange={(e) => setAsset(e.target.value)}>
              {WITHDRAWABLE_ASSETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
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
      </section>
    </main>
  );
}

export default function AgentDashboardPage() { return <Providers><AppShell><DashboardContent /></AppShell></Providers>; }
}
              </span>
              <span className={styles.walletAssetOptionText}>
                <strong>{item.key === 'native' ? 'USDC' : item.label}</strong>
                <small>{item.key === 'native' ? 'Arc native USDC' : item.label}</small>
              </span>
              {item.key === value ? <span className={styles.walletAssetCheck}>✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [asset, setAsset] = useState('native');
  const [amount, setAmount] = useState('');

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
        WITHDRAWABLE_ASSETS.map(async (asset) => {
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
    const selected = WITHDRAWABLE_ASSETS.find((item) => item.key === asset);
    if (!selected || !amount || Number(amount) <= 0) return setError('Enter a valid funding amount.');
    try {
      setStatus('Preparing funding… Approve the wallet transaction.');
      const raw = parseUnits(amount, selected.decimals);
      const hash = selected.address ? await writeContractAsync({ address: selected.address, abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }], functionName: 'transfer', args: [agent.account, raw] }) : await sendTransactionAsync({ to: agent.account, value: raw, chainId: 5042 });
      await publicClient.waitForTransactionReceipt({ hash }); setAmount(''); setStatus(`${selected.label} funded.`); await loadBalances();
    } catch (e) { setError(e?.shortMessage || e?.message || 'Funding failed.'); setStatus(''); }
  }

  async function withdrawAgent() {
    const selected = WITHDRAWABLE_ASSETS.find((item) => item.key === asset);
    if (!selected || !amount || Number(amount) <= 0) return setError('Enter a valid withdrawal amount.');
    try {
      setStatus('Preparing withdrawal… Approve the wallet transaction.');
      const raw = parseUnits(amount, selected.decimals);
      const hash = selected.address ? await writeContractAsync({ address: agent.account, abi: ACCOUNT_ABI, functionName: 'withdrawToken', args: [selected.address, raw] }) : await writeContractAsync({ address: agent.account, abi: ACCOUNT_ABI, functionName: 'withdrawNative', args: [raw] });
      await publicClient.waitForTransactionReceipt({ hash }); setAmount(''); setStatus(`${selected.label} withdrawn to your wallet.`); await loadBalances();
    } catch (e) { setError(e?.shortMessage || e?.message || 'Withdrawal failed.'); setStatus(''); }
  }

  const recent = useMemo(() => activity.slice(0, 5), [activity]);

  const portfolio = useMemo(() => {
    const totalUsd = balances.reduce((sum, item) => sum + (Number.isFinite(item.usdValue) ? item.usdValue : 0), 0);
    const rows = balances.map((item) => ({
      ...item,
      percentage: totalUsd > 0 && Number.isFinite(item.usdValue) ? (item.usdValue / totalUsd) * 100 : 0,
    }));
    const activeRows = rows.filter((item) => Number.isFinite(item.usdValue) && item.usdValue > 0);
    return { totalUsd, rows, activeRows };
  }, [balances]);

  const portfolioGradient = useMemo(() => {
    if (!portfolio.activeRows.length) return 'conic-gradient(#2b2d31 0 100%)';
    let cursor = 0;
    const segments = portfolio.activeRows.map((item) => {
      const start = cursor;
      cursor += item.percentage;
      return `${item.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  }, [portfolio.activeRows]);

  if (!isConnected) return <div className={styles.emptyState}><h1>Connect your wallet</h1><p>Your agent dashboard is tied to the wallet that owns the smart account.</p></div>;
  if (!agent) return <div className={styles.emptyState}><p>Loading agent…</p></div>;

  return (
    <main className={styles.page}>
      <header className={styles.dashboardHeader}><div><div className={styles.kicker}>Agent dashboard</div><h1>{agent.name}</h1><p>{agent.description || 'Configurable Centry onchain agent.'}</p></div><div className={styles.headerActions}><Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/configure`}>Configure</Link><Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/chat`}>Chat</Link><button className={styles.toggleButton} disabled={isPending} onClick={toggleActive}>{agent.active ? 'Pause agent' : 'Activate agent'}</button></div></header>
      {agents.length > 1 ? <div className={styles.agentSwitcher}><span>Agent</span><select className={styles.input} value={agent.account} onChange={(e) => router.push(`/app/agents/${e.target.value}`)}>{agents.map((item) => <option key={item.account} value={item.account}>{item.name} · {shortAddress(item.account)}</option>)}</select></div> : null}
      {status ? <div className={styles.notice}>{status}</div> : null}{error ? <div className={styles.error}>{error}</div> : null}
      <section className={styles.analyticsHero}><div><span className={agent.active ? styles.statusOn : styles.statusOff}>{agent.active ? 'ACTIVE' : 'OFF'}</span><h2>Agent analytics</h2><p>Monitor this agent here. Configuration and conversation live on their own pages so the dashboard stays focused.</p></div><div className={styles.addressPanel}><span>Smart account</span><code>{agent.account}</code><button type="button" className={styles.textButton} onClick={() => navigator.clipboard.writeText(agent.account)}>Copy address</button></div></section>
      <section className={styles.statsLarge}><div><span>Status</span><strong>{agent.active ? 'Running' : 'Paused'}</strong></div><div><span>Type</span><strong>{agent.registered === false ? 'Unregistered' : 'Centry agent'}</strong></div><div><span>Recent events</span><strong>{activity.length}</strong></div></section>

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
              <h2>Portfolio</h2>
              <p>USD-weighted balances held by this agent smart account.</p>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={loadBalances} disabled={balancesLoading}>
              {balancesLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className={styles.portfolioBody}>
            <div className={styles.pieWrap}>
              <div className={styles.portfolioPie} style={{ background: portfolioGradient }} aria-label={`Agent portfolio total ${formatUsd(portfolio.totalUsd)}`}>
                <div className={styles.pieCenter}>
                  <strong>{formatUsd(portfolio.totalUsd)}</strong>
                  <span>Total value</span>
                </div>
              </div>
            </div>

            <div className={styles.portfolioLegend}>
              {portfolio.rows.map((item) => (
                <div className={styles.portfolioRow} key={item.key}>
                  <div className={styles.portfolioAsset}>
                    <span className={styles.portfolioDot} style={{ background: item.color }} />
                    <div><strong>{item.key === 'native' ? 'USDC' : item.label}</strong><span>{formatAssetAmount(item.raw, item.decimals)}</span></div>
                  </div>
                  <div className={styles.portfolioValue}>
                    <strong>{formatUsd(item.usdValue)}</strong>
                    <span>{item.usdValue == null ? 'No USD feed' : item.percentage > 0 ? `${item.percentage < 10 ? item.percentage.toFixed(1) : item.percentage.toFixed(0)}%` : '0%'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.portfolioMeta}>
            <span>Pie share uses only assets with an available USD price feed.</span>
          </div>
        </section>
      </section>

      <section className={styles.quickLinks}>
        <button
          type="button"
          className={styles.quickCard}
          onClick={() => { setFundOpen((value) => !value); setWithdrawOpen(false); }}
          aria-expanded={fundOpen}
        >
          <strong>Fund agent</strong>
          <span>Add supported assets to the agent smart account.</span>
        </button>
        <button
          type="button"
          className={styles.quickCard}
          onClick={() => { setWithdrawOpen((value) => !value); setFundOpen(false); }}
          aria-expanded={withdrawOpen}
        >
          <strong>Withdraw</strong>
          <span>Move supported assets from the agent back to your wallet.</span>
        </button>
        {fundOpen || withdrawOpen ? (
          <div className={styles.inlineAction}>
            <select className={styles.input} value={asset} onChange={(e) => setAsset(e.target.value)}>
              {WITHDRAWABLE_ASSETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
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
      </section>
    </main>
  );
}

export default function AgentDashboardPage() { return <Providers><AppShell><DashboardContent /></AppShell></Providers>; }
