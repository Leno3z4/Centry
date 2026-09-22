'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, usePublicClient, useSignMessage, useWriteContract } from 'wagmi';
import { keccak256, toBytes } from 'viem';
import { Providers } from '../../../../../components/Providers';
import { AppShell } from '../../../../../components/AppShell';
import { CONTRACT_ADDRESSES } from '../../../../../constants/contracts';
import { AgentConfigForm } from '../../AgentConfigForm';
import {
  ACCOUNT_ABI,
  API_BASE,
  AGENT_ACTION_OPTIONS,
  AGENT_ASSET_OPTIONS,
  RUNNER_ADDRESS,
  apiJson,
  loadOwnedAgents,
  shortAddress,
} from '../../agentClient';
import styles from '../../agents.module.css';

const ACTION_TARGETS = {
  supply: [CONTRACT_ADDRESSES.lendingPool, 'supply(address,uint256)'],
  withdraw: [CONTRACT_ADDRESSES.lendingPool, 'withdraw(address,uint256)'],
  borrow: [CONTRACT_ADDRESSES.lendingPool, 'borrow(address,uint256)'],
  repay: [CONTRACT_ADDRESSES.lendingPool, 'repay(address,uint256)'],
  swap: [CONTRACT_ADDRESSES.unitFlowRouter, 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))'],
  transfer: null,
  castVote: [CONTRACT_ADDRESSES.governor, 'castVote(uint256,uint8)'],
};

function ConfigureContent() {
  const { account } = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync, isPending } = useWriteContract();

  const [agent, setAgent] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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

  async function ownerAuth(action) {
    const challenge = await apiJson(`${API_BASE}/api/v1/agent-admin/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: address, account: agent.account, action }),
    });
    const signature = await signMessageAsync({ message: challenge.message });
    return { challengeToken: challenge.token, signature };
  }

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
        const registerAuth = await ownerAuth('register-agent');
        const registered = await apiJson(`${API_BASE}/api/v1/agents/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...registerAuth,
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
        const providerAuth = await ownerAuth('configure-ai-provider');
        await apiJson(`${API_BASE}/api/v1/agents/${targetAgent.id}/providers`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...providerAuth,
            provider: config.provider,
            model: config.model,
            apiKey: config.providerKey,
          }),
        });
      }

      setStatus('Saving agent configuration…');
      const configAuth = await ownerAuth('configure-agent');
      await apiJson(`${API_BASE}/api/v1/agents/${targetAgent.id}/config`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...configAuth,
          owner: address,
          autonomy: { ...config.autonomy, provider: config.provider },
          policy: config.policy,
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

  function selector(signature) {
    return '0x' + keccak256(toBytes(signature)).slice(2, 10);
  }

  async function authorizeRunner() {
    if (!agent || !RUNNER_ADDRESS) return setError('Hosted runner address is not configured.');
    const policy = agent.config?.policy;
    const allowedActions = policy?.allowedActions || AGENT_ACTION_OPTIONS.map(([value]) => value);
    const allowedAssets = policy?.allowedAssets || AGENT_ASSET_OPTIONS.map(([value]) => value);
    if (allowedActions.includes('swap') && (!allowedAssets.includes('CENT') || !allowedAssets.includes('USDC'))) {
      return setError('Swap requires both CENT and USDC to be allowed.');
    }

    try {
      setStatus('Authorizing the hosted runner… You will approve the required onchain permissions.');
      const operatorHash = await writeContractAsync({
        address: agent.account,
        abi: ACCOUNT_ABI,
        functionName: 'setAgentOperator',
        args: [RUNNER_ADDRESS, true],
      });
      await publicClient.waitForTransactionReceipt({ hash: operatorHash });

      const permissions = [];
      const add = (target, signature) => permissions.push([target, selector(signature)]);
      for (const action of allowedActions) {
        if (ACTION_TARGETS[action]) add(...ACTION_TARGETS[action]);
      }

      const tokenAddresses = {
        USDC: CONTRACT_ADDRESSES.USDC,
        EURC: CONTRACT_ADDRESSES.EURC,
        CIRBTC: CONTRACT_ADDRESSES.CIRBTC,
        CENT: CONTRACT_ADDRESSES.centryToken,
      };
      if (allowedActions.includes('supply') || allowedActions.includes('repay')) {
        for (const asset of allowedAssets) if (tokenAddresses[asset]) add(tokenAddresses[asset], 'approve(address,uint256)');
      }
      if (allowedActions.includes('swap')) add(CONTRACT_ADDRESSES.centryToken, 'approve(address,uint256)');
      if (allowedActions.includes('transfer')) add(agent.account, 'transferToAgent(address,address,uint256)');

      for (const [target, sel] of permissions) {
        const tx = await writeContractAsync({
          address: agent.account,
          abi: ACCOUNT_ABI,
          functionName: 'setPermission',
          args: [RUNNER_ADDRESS, target, sel, true, 0, 0n],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
      }
      setStatus('Hosted runner authorized for the current saved policy.');
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Runner authorization failed.');
      setStatus('');
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

      <AgentConfigForm mode="edit" agent={agent} onSubmit={saveConfiguration} submitting={isPending || saving} submitLabel="Save configuration" />

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
        <button className={styles.secondaryButton} onClick={authorizeRunner}>Authorize runner + saved permissions</button>
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
