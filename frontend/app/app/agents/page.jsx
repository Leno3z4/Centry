'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useSignMessage, useWriteContract } from 'wagmi';
import { keccak256, toBytes, isAddress } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import styles from './agents.module.css';

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_CENTRY_AGENT_FACTORY;
const API_BASE = (process.env.NEXT_PUBLIC_CENTRY_AGENT_API_URL || '').replace(/\/$/, '');

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getAgentAccounts',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'accounts', type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'createAgentAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'templateId', type: 'bytes32' },
      { name: 'configHash', type: 'bytes32' },
      { name: 'metadataURI', type: 'string' },
      { name: 'initialOperator', type: 'address' },
    ],
    outputs: [{ name: 'agentAccount', type: 'address' }],
  },
];

const ACCOUNT_ABI = [
  {
    type: 'function',
    name: 'agentOperators',
    stateMutability: 'view',
    inputs: [{ name: 'operator', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setAgentOperator',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'active', type: 'bool' },
    ],
    outputs: [],
  },
];

const DEFAULT_SCOPES = ['read', 'lend', 'borrow', 'repay'];
const OPTIONAL_SCOPES = [
  ['read', 'Read balances, positions and capabilities'],
  ['lend', 'Supply and withdraw'],
  ['borrow', 'Borrow assets'],
  ['repay', 'Repay debt'],
  ['swap', 'Swap through Centry-approved routes'],
  ['governance', 'Governance actions'],
  ['agent-management', 'Manage agent configuration'],
];

function normalizeAddress(value) {
  return value?.trim() || '';
}

function AgentPageContent() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [operator, setOperator] = useState('');
  const [scopes, setScopes] = useState(DEFAULT_SCOPES);
  const [prompt, setPrompt] = useState('');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const accountsQuery = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getAgentAccounts',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(FACTORY_ADDRESS && address) },
  });

  const accounts = useMemo(() => accountsQuery.data || [], [accountsQuery.data]);
  const activeAccount = selectedAccount || accounts[0] || '';

  useEffect(() => {
    if (!selectedAccount && accounts[0]) setSelectedAccount(accounts[0]);
  }, [accounts, selectedAccount]);

  const operatorQuery = useReadContract({
    address: activeAccount || undefined,
    abi: ACCOUNT_ABI,
    functionName: 'agentOperators',
    args: operator && isAddress(operator) ? [operator] : undefined,
    query: { enabled: Boolean(activeAccount && isAddress(operator)) },
  });

  const operatorAuthorized = operatorQuery.data === true;

  function toggleScope(scope) {
    setScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope]);
  }

  async function createAccount() {
    setError('');
    setStatus('');
    if (!address) return setError('Connect your wallet first.');
    if (!FACTORY_ADDRESS) return setError('Agent factory is not configured.');
    if (!isAddress(operator)) return setError('Enter the external agent operator address first.');

    try {
      setStatus('Creating your Centry agent account…');
      const txHash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'createAgentAccount',
        args: [
          keccak256(toBytes('centry-external-agent')),
          keccak256(toBytes('centry-agent-config-v1')),
          process.env.NEXT_PUBLIC_CENTRY_AGENT_METADATA_URI || '',
          operator,
        ],
      });
      setStatus(`Agent account transaction submitted: ${txHash}`);
      await accountsQuery.refetch();
    } catch (err) {
      setError(err?.shortMessage || err?.message || 'Failed to create the agent account.');
      setStatus('');
    }
  }

  async function authorizeOperator() {
    setError('');
    setStatus('');
    if (!activeAccount) return setError('Create or select an agent account first.');
    if (!isAddress(operator)) return setError('Enter a valid operator address.');

    try {
      setStatus('Waiting for wallet approval…');
      const txHash = await writeContractAsync({
        address: activeAccount,
        abi: ACCOUNT_ABI,
        functionName: 'setAgentOperator',
        args: [operator, true],
      });
      setStatus(`Operator authorization submitted: ${txHash}`);
      await operatorQuery.refetch();
    } catch (err) {
      setError(err?.shortMessage || err?.message || 'Failed to authorize the operator.');
      setStatus('');
    }
  }

  async function createConnection() {
    setError('');
    setStatus('');
    setPrompt('');
    setConnectionUrl('');

    if (!address || !activeAccount) return setError('Connect your wallet and select an agent account.');
    if (!isAddress(operator)) return setError('Enter the operator address controlled by the external agent.');
    if (!operatorAuthorized) return setError('Authorize this operator on the agent account first.');
    if (!scopes.length) return setError('Select at least one capability.');
    if (!API_BASE) return setError('Agent API URL is not configured.');

    try {
      setStatus('Requesting connection challenge…');
      const challengeResponse = await fetch(`${API_BASE}/api/v1/agent-connections/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: address, account: activeAccount }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.error || 'Could not create connection challenge.');

      setStatus('Approve the wallet signature…');
      const signature = await signMessageAsync({ message: challenge.message });

      setStatus('Creating secure agent connection…');
      const connectionResponse = await fetch(`${API_BASE}/api/v1/agent-connections`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeToken: challenge.challengeToken,
          signature,
          operator,
          scopes,
        }),
      });
      const connection = await connectionResponse.json();
      if (!connectionResponse.ok) throw new Error(connection.error || 'Could not create the agent connection.');

      setPrompt(connection.prompt || '');
      setConnectionUrl(connection.connectionUrl || '');
      setStatus('Connection ready. Copy the prompt into the external agent.');
    } catch (err) {
      setError(err?.shortMessage || err?.message || 'Failed to create the agent connection.');
      setStatus('');
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setStatus('Connection prompt copied.');
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>EXTERNAL AGENTS</span>
          <h1>Connect an agent</h1>
          <p>Authorize an external AI agent to operate your Centry account through a user-specific Skill connection.</p>
        </div>
      </div>

      {!isConnected ? (
        <section className={styles.card}>
          <h2>Wallet required</h2>
          <p>Connect your wallet before creating or authorizing an agent account.</p>
        </section>
      ) : (
        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.cardTop}>
              <div><h2>1 · Agent operator</h2><p>The operator address is the wallet the external agent will use to sign transactions.</p></div>
            </div>
            <label className={styles.label}>Operator wallet address</label>
            <input
              className={styles.input}
              value={operator}
              onChange={(event) => setOperator(normalizeAddress(event.target.value))}
              placeholder="0x…"
              spellCheck="false"
            />
            <p className={styles.hint}>Never enter the operator's private key here.</p>

            {accounts.length ? (
              <>
                <label className={styles.label}>Centry agent account</label>
                <select className={styles.input} value={activeAccount} onChange={(event) => setSelectedAccount(event.target.value)}>
                  {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
                </select>
                <div className={`${styles.authState} ${operatorAuthorized ? styles.authorized : ''}`}>
                  <span>{operatorAuthorized ? 'Operator authorized' : 'Operator not yet authorized'}</span>
                  {!operatorAuthorized ? (
                    <button type="button" className={styles.secondaryButton} disabled={isWritePending} onClick={authorizeOperator}>Authorize</button>
                  ) : null}
                </div>
              </>
            ) : (
              <button type="button" className={styles.primaryButton} disabled={isWritePending} onClick={createAccount}>Create agent account</button>
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.cardTop}>
              <div><h2>2 · Connection scope</h2><p>Choose what this connection is allowed to request from Centry.</p></div>
            </div>
            <div className={styles.scopeList}>
              {OPTIONAL_SCOPES.map(([scope, description]) => (
                <label key={scope} className={styles.scopeRow}>
                  <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                  <span><strong>{scope}</strong><small>{description}</small></span>
                </label>
              ))}
            </div>
            <button type="button" className={styles.primaryButton} disabled={isWritePending || !operatorAuthorized} onClick={createConnection}>Generate connection prompt</button>
          </section>
        </div>
      )}

      {status ? <div className={styles.notice}>{status}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {prompt ? (
        <section className={styles.card}>
          <div className={styles.cardTop}>
            <div><h2>3 · Copy into your agent</h2><p>The external agent fetches the user-specific Skill URL, establishes a short-lived session, then uses only the returned capabilities.</p></div>
            <button type="button" className={styles.secondaryButton} onClick={copyPrompt}>Copy prompt</button>
          </div>
          <div className={styles.promptBox}><pre>{prompt}</pre></div>
          <div className={styles.connectionMeta}><span>Connection URL</span><code>{connectionUrl}</code></div>
          <p className={styles.hint}>The connection expires quickly. Generate a new one when you need to connect another agent session.</p>
        </section>
      ) : null}
    </div>
  );
}

export default function AgentsPage() {
  return <Providers><AppShell><AgentPageContent /></AppShell></Providers>;
}
