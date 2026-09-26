'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useChainId, usePublicClient, useSignMessage, useWriteContract } from 'wagmi';
import { encodeFunctionData, keccak256, toBytes } from 'viem';
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
    setError('');
    setStatus('');

    if (!agent || !RUNNER_ADDRESS) return setError('Hosted runner address is not configured.');
    if (!address || !publicClient) return setError('Connect your wallet before authorizing the hosted runner.');
    if (chainId !== arcMainnet.id) return setError('Switch your wallet to Arc Mainnet before authorizing the hosted runner.');

    const policy = agent.config?.policy;
    const allowedActions = policy?.allowedActions || AGENT_ACTION_OPTIONS.map(([value]) => value);
    const allowedAssets = policy?.allowedAssets || AGENT_ASSET_OPTIONS.map(([value]) => value);
    if (allowedActions.includes('swap') && (!allowedAssets.includes('CENT') || !allowedAssets.includes('USDC'))) {
      return setError('Swap requires both CENT and USDC to be allowed.');
    }

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

      const desiredPermissions = [];
      const permissionKeys = new Set();
      const add = (target, signature) => {
        const normalizedTarget = target.toLowerCase();
        const normalizedSelector = selector(signature).toLowerCase();
        const key = normalizedTarget + ':' + normalizedSelector;
        if (permissionKeys.has(key)) return;
        permissionKeys.add(key);
        desiredPermissions.push([target, selector(signature)]);
      };

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
        for (const asset of allowedAssets) {
          if (tokenAddresses[asset]) add(tokenAddresses[asset], 'approve(address,uint256)');
        }
      }
      if (allowedActions.includes('swap')) add(CONTRACT_ADDRESSES.centryToken, 'approve(address,uint256)');
      if (allowedActions.includes('transfer')) add(agent.account, 'transferToAgent(address,address,uint256)');

      const operatorAlreadyAuthorized = await publicClient.readContract({
        address: agent.account,
        abi: ACCOUNT_ABI,
        functionName: 'agentOperators',
        args: [RUNNER_ADDRESS],
      });

      const pending = [];
      if (!operatorAlreadyAuthorized) {
        pending.push({
          label: 'runner operator',
          functionName: 'setAgentOperator',
          args: [RUNNER_ADDRESS, true],
        });
      }

      for (const [target, sel] of desiredPermissions) {
        const current = await publicClient.readContract({
          address: agent.account,
          abi: ACCOUNT_ABI,
          functionName: 'permissions',
          args: [RUNNER_ADDRESS, target, sel],
        });
        const allowed = Boolean(current?.[0]);
        const expiresAt = BigInt(current?.[1] ?? 0);
        const maxNativeValue = BigInt(current?.[2] ?? 0);

        if (allowed && expiresAt === 0n && maxNativeValue === 0n) continue;

        pending.push({
          label: 'permission ' + target.slice(0, 10) + '… ' + sel,
          functionName: 'setPermission',
          args: [RUNNER_ADDRESS, target, sel, true, 0n, 0n],
        });
      }

      if (!pending.length) {
        await loadAgent();
        setStatus('Hosted runner is already authorized for the current saved policy.');
        return;
      }

      setStatus('Preparing ' + pending.length + ' separate authorization transactions…');

      for (let index = 0; index < pending.length; index += 1) {
        const item = pending[index];
        const txConfig = {
          account: address,
          chain: arcMainnet,
          address: agent.account,
          abi: ACCOUNT_ABI,
          functionName: item.functionName,
          args: item.args,
        };

        // Simulate this exact single-call transaction before opening the wallet.
        await publicClient.call({
          account: address,
          to: agent.account,
          data: encodeFunctionData({
            abi: ACCOUNT_ABI,
            functionName: item.functionName,
            args: item.args,
          }),
        });

        setStatus('Approve transaction ' + (index + 1) + '/' + pending.length + ': ' + item.label + '…');

        const hash = await writeContractAsync(txConfig);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (String(receipt?.status || '').toLowerCase() !== 'success' && String(receipt?.status || '').toLowerCase() !== '0x1') {
          throw new Error('authorization_transaction_reverted');
        }
      }

      await loadAgent();
      setStatus('Hosted runner authorized for the current saved policy.');
    } catch (e) {
      const raw = e?.shortMessage || e?.message || '';
      const message =
        raw === 'connected_wallet_is_not_agent_owner'
          ? 'The connected wallet is not the owner of this agent smart account. No transaction was sent.'
          : raw === 'authorization_transaction_reverted'
            ? 'An authorization transaction reverted. Remaining authorization transactions were not sent.'
            : /user rejected|user denied|rejected the request|denied/i.test(raw)
              ? 'Authorization was rejected in the wallet. Remaining authorization transactions were not sent.'
              : raw || 'Runner authorization failed. Remaining authorization transactions were not sent.';
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
          {authorizing ? 'Authorizing…' : 'Authorize runner + saved permissions'}
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
