'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, usePublicClient, useSignMessage, useSendTransaction, useWriteContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../../components/Providers';
import { AppShell } from '../../../../components/AppShell';
import styles from '../agents.module.css';
import {
  ACCOUNT_ABI,
  API_BASE,
  FACTORY_ABI,
  FACTORY_ADDRESS,
  RUNNER_ADDRESS,
  WITHDRAWABLE_ASSETS,
  apiJson,
  loadOwnedAgents,
  shortAddress,
} from '../agentClient';

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

  async function ownerAuth(action) {
    const challenge = await apiJson(`${API_BASE}/api/v1/agent-admin/challenge`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: address, account: agent.account, action }),
    });
    const signature = await signMessageAsync({ message: challenge.message });
    return { challengeToken: challenge.token, signature };
  }

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
      const auth = await ownerAuth('agent-analytics');
      const result = await apiJson(`${API_BASE}/api/v1/agents/${agent.id}/activity`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(auth) });
      setActivity(result.activity || []);
    } catch (e) { setError(e.message); }
  }

  async function loadBalances() {
    if (!publicClient || !account) return;
    setBalancesLoading(true);
    try {
      const rows = await Promise.all(
        WITHDRAWABLE_ASSETS.map(async (asset) => {
          if (!asset.address) {
            const raw = await publicClient.getBalance({ address: account });
            return { ...asset, raw: raw.toString() };
          }

          const raw = await publicClient.readContract({
            address: asset.address,
            abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] }],
            functionName: 'balanceOf',
            args: [account],
          });
          return { ...asset, raw: raw.toString() };
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
  if (!isConnected) return <div className={styles.emptyState}><h1>Connect your wallet</h1><p>Your agent dashboard is tied to the wallet that owns the smart account.</p></div>;
  if (!agent) return <div className={styles.emptyState}><p>Loading agent…</p></div>;

  return (
    <main className={styles.page}>
      <header className={styles.dashboardHeader}><div><div className={styles.kicker}>Agent dashboard</div><h1>{agent.name}</h1><p>{agent.description || 'Configurable Centry onchain agent.'}</p></div><div className={styles.headerActions}><Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/configure`}>Configure</Link><Link className={styles.secondaryButton} href={`/app/agents/${agent.account}/chat`}>Chat</Link><button className={styles.toggleButton} disabled={isPending} onClick={toggleActive}>{agent.active ? 'Pause agent' : 'Activate agent'}</button></div></header>
      {agents.length > 1 ? <div className={styles.agentSwitcher}><span>Agent</span><select className={styles.input} value={agent.account} onChange={(e) => router.push(`/app/agents/${e.target.value}`)}>{agents.map((item) => <option key={item.account} value={item.account}>{item.name} · {shortAddress(item.account)}</option>)}</select></div> : null}
      {status ? <div className={styles.notice}>{status}</div> : null}{error ? <div className={styles.error}>{error}</div> : null}
      <section className={styles.analyticsHero}><div><span className={agent.active ? styles.statusOn : styles.statusOff}>{agent.active ? 'ACTIVE' : 'OFF'}</span><h2>Agent analytics</h2><p>Monitor this agent here. Configuration and conversation live on their own pages so the dashboard stays focused.</p></div><div className={styles.addressPanel}><span>Smart account</span><code>{agent.account}</code><button type="button" className={styles.textButton} onClick={() => navigator.clipboard.writeText(agent.account)}>Copy address</button></div></section>
      <section className={styles.statsLarge}><div><span>Status</span><strong>{agent.active ? 'Running' : 'Paused'}</strong></div><div><span>Type</span><strong>{agent.registered === false ? 'Unregistered' : 'Centry agent'}</strong></div><div><span>Recent events</span><strong>{activity.length}</strong></div><div><span>Operator</span><strong>{shortAddress(RUNNER_ADDRESS)}</strong></div></section>
      <section className={styles.card}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Balance</h2>
            <p>Live balances held by this agent smart account on Arc Mainnet.</p>
          </div>
          <button className={styles.secondaryButton} type="button" onClick={loadBalances} disabled={balancesLoading}>
            {balancesLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <div className={styles.agentBalanceGrid}>
          {balances.length ? balances.map((item) => {
            const formatted = formatUnits(BigInt(item.raw || '0'), item.decimals);
            const parts = formatted.split('.');
            const fraction = (parts[1] || '').slice(0, 6).replace(/0+$/, '');
            const display = fraction ? parts[0] + '.' + fraction : parts[0];
            return (
              <div className={styles.agentBalanceCard} key={item.key}>
                <span>{item.label}</span>
                <strong>{display}</strong>
                <small>{item.key === 'native' ? 'Arc native USDC' : item.label.split(' (')[0]}</small>
              </div>
            );
          }) : (
            <div className={styles.empty}>{balancesLoading ? 'Loading balances…' : 'No balances loaded.'}</div>
          )}
        </div>
      </section>
      <section className={styles.analyticsGrid}><section className={styles.card}><div className={styles.sectionHead}><div><h2>Recent activity</h2><p>Load the verified onchain activity when you want to inspect what this agent has done.</p></div><button className={styles.secondaryButton} onClick={loadActivity}>Load activity</button></div><div className={styles.activityList}>{recent.length ? recent.map((item, index) => <div className={styles.activity} key={`${item.transactionHash}-${index}`}><div><strong>{item.type}</strong><span>Block {item.blockNumber}</span></div><code>{item.transactionHash}</code></div>) : <div className={styles.empty}>No activity loaded yet.</div>}</div></section><section className={styles.card}><div className={styles.sectionHead}><div><h2>Agent wallet</h2><p>Funds are held by the smart account and are available to the permissions you configure.</p></div></div><div className={styles.walletActions}><button className={styles.primaryButton} onClick={() => { setFundOpen((value) => !value); setWithdrawOpen(false); }}>Fund</button><button className={styles.secondaryButton} onClick={() => { setWithdrawOpen((value) => !value); setFundOpen(false); }}>Withdraw</button></div>{fundOpen || withdrawOpen ? <div className={styles.inlineAction}><select className={styles.input} value={asset} onChange={(e) => setAsset(e.target.value)}>{WITHDRAWABLE_ASSETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><input className={styles.input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /><button className={styles.primaryButton} onClick={fundOpen ? fundAgent : withdrawAgent}>{fundOpen ? 'Fund' : 'Withdraw'}</button></div> : null}</section></section>
      <section className={styles.quickLinks}><Link href={`/app/agents/${agent.account}/configure`} className={styles.quickCard}><strong>Configure</strong><span>AI provider, autonomy, permissions and external access.</span></Link><Link href={`/app/agents/${agent.account}/chat`} className={styles.quickCard}><strong>Chat with agent</strong><span>Talk to the agent and ask what it has done.</span></Link></section>
    </main>
  );
}

export default function AgentDashboardPage() { return <Providers><AppShell><DashboardContent /></AppShell></Providers>; }
