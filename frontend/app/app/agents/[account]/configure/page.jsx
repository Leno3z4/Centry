'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useChainId, usePublicClient, useSignMessage, useWriteContract } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { Providers } from '../../../../../components/Providers';
import { AppShell } from '../../../../../components/AppShell';
import { CONTRACT_ADDRESSES } from '../../../../../constants/contracts';
import { arcMainnet } from '../../../../../config/multiWagmi';
import { AgentConfigForm } from '../../AgentConfigForm';
import {
  ACCOUNT_ABI,
  API_BASE,
  AGENT_ACTION_OPTIONS,
  AGENT_ASSET_OPTIONS,
  RUNNER_ADDRESS,
  apiJson,
  ensureOwnerSession,
  loadOwnedAgents,
  shortAddress,
  RUNNER_PERMISSION_TTL_SECONDS,
  RUNNER_FINANCIAL_WINDOW_SECONDS,
  buildRunnerAuthorizationPlan,
} from '../../agentClient';
import styles from '../../agents.module.css';

function ConfigureContent() {
  const { account } = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync, isPending: writePending } = useWriteContract();

  const [agent, setAgent] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);

  async function loadAgent() {
    if (!address || !publicClient) return;
    const agents = await loadOwnedAgents({ address, publicClient });
    const selected = agents.find((item) => item.account.toLowerCase() === String(account).toLowerCase());
    if (!selected) {
      if (agents[0]) router.replace(`/app/agents/${agents[0].account}/configure`);
      else router.replace('/app/agents');
      return;
    }
    setAgent(selected);
  }

  useEffect(() => { loadAgent().catch((e) => setError(e.message)); }, [address, publicClient, account]);

  async function saveConfiguration(config) {
    if (!agent) return;
    setError('');
    setStatus('');
    setSaving(true);

    try {
      let targetAgent = agent;

      if (agent.registered === false) {
        if (!RUNNER_ADDRESS) {
          throw new Error('Hosted runner address is not configured, so this smart account cannot be registered yet.');
        }

        setStatus('Registering this smart account…');
        const agentId = crypto.randomUUID();
        await ensureOwnerSession({ address, account: agent.account, signMessageAsync });
        const registered = await apiJson(`${API_BASE}/api/v1/agents/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            owner: address,
            account: agent.account,
            agentId,
            type: 'standard',
            name: config.name.trim() || 'Centry Agent',
            description: config.description.trim() || 'Configurable Centry onchain agent.',
            operator: RUNNER_ADDRESS,
            priceUsdCents: 0,
          }),
        });

        targetAgent = registered.agent;
        setAgent(targetAgent);
      }

      if (config.providerKey) {
        setStatus('Saving encrypted provider configuration…');
        await ensureOwnerSession({ address, account: targetAgent.account, signMessageAsync });
        await apiJson(`${API_BASE}/api/v1/agents/${targetAgent.id}/providers`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: config.provider,
            model: config.model,
            apiKey: config.providerKey,
          }),
        });
      }

      setStatus('Saving agent configuration…');
      await ensureOwnerSession({ address, account: targetAgent.account, signMessageAsync });
      await apiJson(`${API_BASE}/api/v1/agents/${targetAgent.id}/config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          autonomy: { ...config.autonomy, provider: config.provider },
          policy: config.policy,
          a2a: config.a2a,
        }),
      });

      await loadAgent();
      setStatus('Agent configuration saved.');
    } catch (e) {
      setStatus('');
      setError(e?.shortMessage || e?.message || 'Configuration could not be saved.');
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function authorizeRunner() {
    setError('');
    setStatus('');

    if (!agent || !RUNNER_ADDRESS) return setError('Hosted runner address is not configured.');
    if (!address || !publicClient) return setError('Connect your wallet before authorizing the hosted runner.');
    if (chainId !== arcMainnet.id) return setError('Switch your wallet to Arc Mainnet before authorizing the hosted runner.');

    try {
      setAuthorizing(true);
      setStatus('Checking agent ownership and existing permissions…');

      const owner = await publicClient.readContract({
        address: agent.account,
        abi: ACCOUNT_ABI,
        functionName: 'owner',
      });
      if (String(owner).toLowerCase() !== String(address).toLowerCase()) {
        throw new Error('connected_wallet_is_not_agent_owner');
      }

      const authorizationPlan = buildRunnerAuthorizationPlan({
        policy: agent.config?.policy || {},
        agentAccount: agent.account,
      });

      if (authorizationPlan.financialLimits.length) {
        let version;
        try {
          version = await publicClient.readContract({
            address: agent.account,
            abi: ACCOUNT_ABI,
            functionName: 'financialLimitVersion',
          });
        } catch {
          throw new Error('agent_account_requires_financial_limit_upgrade');
        }
        if (BigInt(version) < 1n) throw new Error('agent_account_requires_financial_limit_upgrade');
      }

      const permissionUpdates = [];
      for (const item of authorizationPlan.permissions) {
        const current = await publicClient.readContract({
          address: agent.account,
          abi: ACCOUNT_ABI,
          functionName: 'permissions',
          args: [item[0], item[1], item[2]],
        });
        const allowed = Boolean(current?.[0]);
        const expiresAt = BigInt(current?.[1] ?? 0);
        const maxNativeValue = BigInt(current?.[2] ?? 0);
        const expiryNeedsUpdate = item[4] === 0n ? expiresAt !== 0n : expiresAt < item[4];
        if (!allowed || expiryNeedsUpdate || maxNativeValue !== item[5]) {
          permissionUpdates.push(item);
        }
      }

      const limitUpdates = [];
      for (const item of authorizationPlan.financialLimits) {
        const current = await publicClient.readContract({
          address: agent.account,
          abi: ACCOUNT_ABI,
          functionName: 'financialLimits',
          args: [item[0], item[1], item[2], item[3]],
        });
        const currentPerCall = BigInt(current?.[0] ?? 0);
        const currentPerWindow = BigInt(current?.[1] ?? 0);
        const currentWindow = BigInt(current?.[4] ?? 0);
        if (currentPerCall !== item[4] || currentPerWindow !== item[5] || currentWindow !== item[6]) limitUpdates.push(item);
      }

      const spenderUpdates = [];
      for (const item of authorizationPlan.approvalSpenders) {
        const current = await publicClient.readContract({
          address: agent.account,
          abi: ACCOUNT_ABI,
          functionName: 'approvalSpenders',
          args: [item[0], item[1], item[2]],
        });
        if (Boolean(current) !== Boolean(item[3])) spenderUpdates.push(item);
      }

      const writeCount = permissionUpdates.length + limitUpdates.length + spenderUpdates.length;
      if (!writeCount) {
        await loadAgent();
        setStatus('Hosted runner is already authorized with the saved permissions.');
        return;
      }

      const args = [permissionUpdates, limitUpdates, spenderUpdates];
      await publicClient.call({
        account: address,
        to: agent.account,
        data: encodeFunctionData({
          abi: ACCOUNT_ABI,
          functionName: 'configureAuthorization',
          args,
        }),
      });

      setStatus('Approve one authorization transaction… ' + writeCount + ' changes will be applied.');

      const hash = await writeContractAsync({
        account: address,
        chain: arcMainnet,
        address: agent.account,
        abi: ACCOUNT_ABI,
        functionName: 'configureAuthorization',
        args,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (String(receipt?.status || '').toLowerCase() !== 'success' && String(receipt?.status || '').toLowerCase() !== '0x1') {
        throw new Error('authorization_transaction_reverted');
      }

      await loadAgent();
      setStatus('Hosted runner authorized with persistent permissions and 24-hour financial limits.');
    } catch (e) {
      const raw = e?.shortMessage || e?.message || '';
      const message =
        raw === 'connected_wallet_is_not_agent_owner'
          ? 'The connected wallet is not the owner of this agent smart account. No transaction was sent.'
          : raw === 'agent_account_requires_financial_limit_upgrade'
            ? 'This agent account was created with the older implementation. Create a new agent account from the updated factory before authorizing financial actions.'
            : raw.startsWith('missing_financial_cap_')
              ? 'Set maximum amounts for every asset used by the saved financial actions before authorizing the runner.'
              : raw.startsWith('invalid_financial_cap_')
                ? 'One of the financial caps is not a valid token amount.'
                : raw.startsWith('financial_cap_too_large_')
                  ? 'One of the financial caps is too large for the onchain limit.'
                  : raw === 'authorization_transaction_reverted'
                    ? 'The authorization transaction reverted. No later authorization changes were sent.'
                    : /user rejected|user denied|rejected the request|denied/i.test(raw)
                      ? 'Authorization was rejected in the wallet. No later authorization changes were sent.'
                      : raw || 'Runner authorization failed.';
      setError(message);
      setStatus('');
    } finally {
      setAuthorizing(false);
    }
  }

  if (!agent) return <main className={styles.page}><div className={styles.emptyState}>Loading agent…</div></main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.backButton} href={`/app/agents/${agent.account}`}>← Agent dashboard</Link>
          <h1>Configure {agent.registered === false ? 'agent' : agent.name}</h1>
          <p>Set the AI provider, behavior and permissions for this existing smart account.</p>
        </div>
      </header>

      {status ? <div className={styles.notice}>{status}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <AgentConfigForm mode="edit" agent={agent} onSubmit={saveConfiguration} submitting={saving} submitLabel="Save configuration" />

      <section className={styles.card}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Hosted execution</h2>
            <p>Authorize Centry's dedicated runner using the policy you last saved. The runner never gets your owner key.</p>
          </div>
        </div>
        <div className={styles.storeCard}>
          <div><strong>Centry runner</strong><p>{RUNNER_ADDRESS || 'Not configured'}</p></div>
          <div className={styles.price}>Arc · 5042</div>
        </div>
        <button className={styles.secondaryButton} onClick={authorizeRunner} disabled={saving || authorizing || writePending}>
          {authorizing ? 'Authorizing…' : 'Authorize runner + saved permissions (1 tx)'}
        </button>
      </section>

      <section className={styles.card}>
        <div className={styles.sectionHead}>
          <div><h2>Agent wallet</h2><p>Smart account {shortAddress(agent.account)} · owned by {shortAddress(address)}</p></div>
        </div>
        <p className={styles.hint}>Fund and withdraw from the agent dashboard. Keep the agent OFF while changing sensitive permissions.</p>
      </section>
    </main>
  );
}

export default function ConfigureAgentPage() {
  return <Providers><AppShell><ConfigureContent /></AppShell></Providers>;
}
