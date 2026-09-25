'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSignMessage,
} from 'wagmi';
import { arcMainnet } from '../config/multiWagmi';
import styles from './AgentConnectionPanel.module.css';

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getAgentAccounts',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'accounts', type: 'address[]' }],
  },
];

const DEFAULT_SCOPES = ['read'];
const SCOPE_OPTIONS = [
  ['read', 'Read balances, positions, markets, rates and connection state'],
  ['lend', 'Supply, withdraw and manage lending positions'],
  ['borrow', 'Manage permitted borrowing actions'],
  ['repay', 'Repay debt and manage repayment actions'],
  ['swap', 'Use Centry-supported swap routes'],
  ['governance', 'Participate in supported governance actions'],
  ['agent-management', 'Manage Centry agent/account settings'],
];

function apiBase() {
  return (process.env.NEXT_PUBLIC_CENTRY_AGENT_API_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
}

function explorerAddress(address) {
  if (!address) return '#';
  return `${arcMainnet.blockExplorers.default.url}/address/${address}`;
}

function short(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
}

export default function AgentConnectionPanel({ agentAccount = '' } = {}) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: arcMainnet.id });
  const { signMessageAsync } = useSignMessage();
  const [selectedScopes, setSelectedScopes] = useState(DEFAULT_SCOPES);
  const [selectedAccount, setSelectedAccount] = useState(agentAccount || '');
  const [existingAccount, setCustomAccount] = useState('');
  const [prompt, setPrompt] = useState('');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isConnectingAgent, setIsConnectingAgent] = useState(false);
  const [operatorAddress, setOperatorAddress] = useState('');

  const factoryAddress = process.env.NEXT_PUBLIC_CENTRY_AGENT_FACTORY;
  const configuredApi = apiBase();

  const accountsQuery = useReadContract({
    address: factoryAddress,
    abi: FACTORY_ABI,
    functionName: 'getAgentAccounts',
    args: address ? [address] : undefined,
    chainId: arcMainnet.id,
    query: { enabled: Boolean(factoryAddress && address && isConnected && chainId === arcMainnet.id) },
  });

  const accounts = useMemo(() => accountsQuery.data || [], [accountsQuery.data]);
  const activeAccount = agentAccount || selectedAccount || existingAccount || accounts[0] || '';
  const wrongNetwork = isConnected && chainId !== arcMainnet.id;

  useEffect(() => {
    if (agentAccount) {
      setSelectedAccount(agentAccount);
      setCustomAccount('');
      return;
    }
    if (!selectedAccount && accounts[0]) setSelectedAccount(accounts[0]);
  }, [accounts, agentAccount, selectedAccount]);

  function toggleScope(scope) {
    setSelectedScopes((current) => {
      if (current.includes(scope)) {
        return current.filter((item) => item !== scope);
      }
      return [...current, scope];
    });
  }

  async function connectAgent() {
    if (!address || !activeAccount || !operatorAddress || !configuredApi) return;

    setError('');
    setPrompt('');
    setConnectionUrl('');
    setCopied(false);
    setIsConnectingAgent(true);
    setStatus('Preparing wallet verification…');

    try {
      const challengeResponse = await fetch(`${configuredApi}/api/v1/agent-connections/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ owner: address, account: activeAccount, scopes: selectedScopes }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.error || 'Could not create the connection challenge.');

      setStatus('Confirm the Centry connection in your wallet…');
      const signature = await signMessageAsync({ message: challenge.message });

      setStatus('Establishing the agent connection…');
      const connectResponse = await fetch(`${configuredApi}/api/v1/agent-connections`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          challengeToken: challenge.challengeToken,
          signature,
          operator: operatorAddress,
          scopes: selectedScopes,
        }),
      });
      const connection = await connectResponse.json();
      if (!connectResponse.ok) throw new Error(connection.error || 'Could not establish the connection.');

      setConnectionUrl(connection.connectionUrl || '');
      setPrompt(connection.prompt || '');
      setStatus('Connection ready. Copy the prompt into your external agent.');
    } catch (caught) {
      setError(caught?.shortMessage || caught?.message || 'Agent connection failed.');
      setStatus('');
    } finally {
      setIsConnectingAgent(false);
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!isConnected) {
    return (
      <section className={styles.panel}>
        <div className={styles.kicker}>EXTERNAL AGENTS</div>
        <h1>Connect an agent to Centry</h1>
        <p className={styles.lede}>Connect an external AI agent to a Centry account without giving the agent your wallet key.</p>
        <div className={styles.notice}>Connect your wallet first. Your wallet remains the owner and approval authority.</div>
      </section>
    );
  }

  return (
    <section className={styles.stack}>
      <div className={styles.panel}>
        <div className={styles.headerRow}>
          <div>
            <div className={styles.kicker}>EXTERNAL AGENTS</div>
            <h1>Connect an agent to your Centry account</h1>
            <p className={styles.lede}>Pick what the external agent may access, sign one wallet message, then copy a connection prompt into the agent.</p>
          </div>
          <div className={styles.walletBadge}>{short(address)}</div>
        </div>

        {wrongNetwork ? <div className={styles.error}>Switch to Arc Mainnet before creating or connecting an agent.</div> : null}

        {!factoryAddress ? (
          <div className={styles.notice}>Select an agent created in your Centry Agents page before connecting an external agent.</div>
        ) : null}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Agent account</div>
          <div className={styles.notice}>
            This connection is scoped to <strong>{short(agentAccount)}</strong>.
            <a className={styles.addressLink} href={explorerAddress(agentAccount)} target="_blank" rel="noreferrer">{agentAccount}</a>
          </div>
        </div>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>External operator</div>
          <p className={styles.lede}>Enter the wallet address the external agent will use to sign transactions. It must already be authorized on this Centry smart account.</p>
          <input
            value={operatorAddress}
            onChange={(event) => setOperatorAddress(event.target.value.trim())}
            placeholder="0x… external agent operator address"
            spellCheck="false"
            inputMode="text"
          />
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Connection scope</div>
          <div className={styles.scopeGrid}>
            {SCOPE_OPTIONS.map(([scope, description]) => (
              <button
                key={scope}
                type="button"
                className={`${styles.scope} ${selectedScopes.includes(scope) ? styles.scopeSelected : ''}`}
                onClick={() => toggleScope(scope)}
              >
                <span className={styles.checkbox}>{selectedScopes.includes(scope) ? '✓' : ''}</span>
                <span><strong>{scope}</strong><small>{description}</small></span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.actionRow}>
          <button type="button" className={styles.primaryButton} onClick={connectAgent} disabled={!activeAccount || !operatorAddress || !configuredApi || isConnectingAgent || wrongNetwork || selectedScopes.length === 0}>
            {isConnectingAgent ? 'Connecting…' : 'Generate agent connection'}
          </button>
          {status ? <span className={styles.status}>{status}</span> : null}
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}
      </div>

      {prompt ? (
        <div className={styles.resultPanel}>
          <div className={styles.headerRow}>
            <div>
              <div className={styles.kicker}>CONNECTION READY</div>
              <h2>Copy this into your external agent</h2>
              <p className={styles.lede}>The prompt points the agent at your user-specific Centry Skill URL. The URL expires and is not a wallet key.</p>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={copyPrompt}>{copied ? 'Copied' : 'Copy prompt'}</button>
          </div>

          <pre className={styles.prompt}><code>{prompt}</code></pre>
          {connectionUrl ? <div className={styles.connectionMeta}><span>Connection URL</span><code>{connectionUrl}</code></div> : null}
        </div>
      ) : null}
    </section>
  );
}
