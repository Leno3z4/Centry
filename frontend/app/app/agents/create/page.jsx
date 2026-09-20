'use client';

import { useState } from 'react';
import { useAccount, usePublicClient, useSignMessage, useWriteContract } from 'wagmi';
import { keccak256, toBytes } from 'viem';
import { useRouter } from 'next/navigation';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { AgentConfigForm } from '../AgentConfigForm';
import {
  AGENT_PRICE_RAW,
  API_BASE,
  FACTORY_ABI,
  FACTORY_ADDRESS,
  PAYWALL_ENABLED,
  RUNNER_ADDRESS,
  apiJson,
  normalizeConfigForHash,
} from '../agentClient';
import styles from '../agents.module.css';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';

export default function CreateAgentPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync, isPending } = useWriteContract();
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [createdAccount, setCreatedAccount] = useState('');
  const [setupComplete, setSetupComplete] = useState(false);

  const ready = Boolean(isConnected && address && publicClient && FACTORY_ADDRESS && RUNNER_ADDRESS);

  async function ownerAuth(account, action) {
    const challenge = await apiJson(`${API_BASE}/api/v1/agent-admin/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: address, account, action }),
    });
    const signature = await signMessageAsync({ message: challenge.message });
    return { challengeToken: challenge.token, signature };
  }

  async function createAgent(config) {
    if (!ready) return setError('Connect your wallet and make sure the Centry agent factory and runner are configured.');
    if (!API_BASE) return setError('Agent API URL is not configured.');
    if (!RUNNER_ADDRESS) return setError('Hosted runner address is not configured.');

    setStatus('Preparing the agent…');
    setError('');
    let createdAccountForRecovery = '';
    try {
      const templateHash = keccak256(toBytes('centry-general-agent'));
      const configHash = keccak256(toBytes(JSON.stringify(normalizeConfigForHash(config))));
      const before = (await publicClient.readContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getAgentAccounts', args: [address] })).map(String);
      let creationTx; 

      if (PAYWALL_ENABLED) {
      setStatus('Approve 2.50 USDC for the agent factory…');
      const approvalHash = await writeContractAsync({
        address: CONTRACT_ADDRESSES.USDC,
        abi: [{
          type: 'function',
          name: 'approve',
          stateMutability: 'nonpayable',
          inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
          outputs: [{ type: 'bool' }],
        }],
        functionName: 'approve',
        args: [FACTORY_ADDRESS, AGENT_PRICE_RAW],
      });
      await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      setStatus('Create your agent on Arc… approve the wallet transaction.');
      creationTx = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'purchaseAndCreateAgentAccount',
        args: [templateHash, configHash, '', RUNNER_ADDRESS],
      });
    } else {
      setStatus('Create your agent on Arc… approve the wallet transaction.');
      creationTx = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'createAgentAccount',
        args: [templateHash, configHash, '', RUNNER_ADDRESS],
      });
    }

      await publicClient.waitForTransactionReceipt({ hash: creationTx });
      setStatus('Smart account created. Finishing agent setup…');

      const after = (await publicClient.readContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getAgentAccounts', args: [address] })).map(String);
      const beforeSet = new Set(before.map((item) => item.toLowerCase()));
      const account = after.find((item) => !beforeSet.has(item.toLowerCase())) || after.at(-1);
      if (!account) throw new Error('The factory transaction succeeded, but the new agent account could not be resolved.');
      createdAccountForRecovery = account;

      const agentId = crypto.randomUUID();
    if (PAYWALL_ENABLED) {
      await apiJson(`${API_BASE}/api/v1/agents/marketplace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          owner: address,
          templateId: 'centry-general-agent',
          onchainTemplateId: templateHash,
          agentId,
          account,
          purchaseTxHash: creationTx,
        }),
      });
    }

    const registerAuth = await ownerAuth(account, 'register-agent');
    await apiJson(`${API_BASE}/api/v1/agents/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...registerAuth,
        owner: address,
        account,
        agentId,
        type: PAYWALL_ENABLED ? 'purchased' : 'standard',
        name: config.name,
        description: config.description || 'Configurable Centry onchain agent.',
        operator: RUNNER_ADDRESS,
        priceUsdCents: PAYWALL_ENABLED ? 250 : 0,
      }),
    });

    const providerAuth = await ownerAuth(account, 'configure-ai-provider');
    await apiJson(`${API_BASE}/api/v1/agents/${agentId}/providers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...providerAuth,
        provider: config.provider,
        model: config.model,
        apiKey: config.providerKey,
      }),
    });

    const configAuth = await ownerAuth(account, 'configure-agent');
    await apiJson(`${API_BASE}/api/v1/agents/${agentId}/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...configAuth,
        owner: address,
        autonomy: { ...config.autonomy, provider: config.provider },
        policy: config.policy,
      }),
    });

      setCreatedAccount(account);
      setSetupComplete(true);
      setStatus('Agent created and configured. Its smart account starts OFF.');
    } catch (e) {
      if (createdAccountForRecovery) setCreatedAccount(createdAccountForRecovery);
      setStatus('');
      setError(e?.shortMessage || e?.message || 'Agent setup failed.');
    }
  }

  if (createdAccount) {
    return (
      <Providers>
        <AppShell>
          <main className={styles.page}>
            {status ? <div className={styles.notice}>{status}</div> : null}
            {error ? <div className={styles.error}>{error}</div> : null}
            <section className={styles.successHero}>
              <div className={styles.successMark}>✓</div>
              <p className={styles.kicker}>Agent ready</p>
              <h1>{setupComplete ? 'Your agent is created' : 'Your smart account is created'}</h1>
              <p>{setupComplete ? 'The smart account is owned by your connected wallet. It starts OFF until you activate it.' : 'The blockchain transaction succeeded, but the off-chain setup still needs attention. You can continue from the agent configuration page.'}</p>
              <div className={styles.addressPanel}>
                <span>Smart account</span>
                <code>{createdAccount}</code>
              </div>
              <div className={styles.headerActions}>
                <button className={styles.secondaryButton} type="button" onClick={() => navigator.clipboard.writeText(createdAccount)}>Copy address</button>
                <a className={styles.secondaryButton} href={`https://explorer.arc.io/address/${createdAccount}`} target="_blank" rel="noreferrer">View on Arc</a>
                <button className={styles.primaryButton} type="button" onClick={() => router.push(`/app/agents/${createdAccount}`)}>Open agent</button>
                <button className={styles.secondaryButton} type="button" onClick={() => router.push(`/app/agents/${createdAccount}/configure`)}>Configure</button>
              </div>
            </section>
          </main>
        </AppShell>
      </Providers>
    );
  }

  return (
    <Providers>
      <AppShell>
        <main className={styles.page}>
          <header className={styles.header}>
            <div>
              <button className={styles.backButton} type="button" onClick={() => router.push('/app/agents')}>← Agents</button>
              <h1>Create agent</h1>
              <p>Configure the agent first. Your wallet only gets asked to create the smart account after you submit this setup.</p>
            </div>
          </header>

          {status ? <div className={styles.notice}>{status}</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}

          {!isConnected ? <div className={styles.emptyState}>Connect your wallet to create an agent.</div> : null}
          {!FACTORY_ADDRESS ? <div className={styles.warning}>Agent factory is not configured yet.</div> : null}

          <AgentConfigForm
            mode="create"
            onSubmit={createAgent}
            submitting={isPending || Boolean(status && !createdAccount && !error)}
            submitLabel={PAYWALL_ENABLED ? 'Purchase & create agent' : 'Create agent'}
          />
        </main>
      </AppShell>
    </Providers>
  );
}
