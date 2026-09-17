'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useSignMessage, useWriteContract } from 'wagmi';
import { keccak256, parseUnits, toBytes, isAddress } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';
import styles from './agents.module.css';

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_CENTRY_AGENT_FACTORY;
const API_BASE = (process.env.NEXT_PUBLIC_CENTRY_AGENT_API_URL || '').replace(/\/$/, '');
const UNIVERSAL_ROUTER = process.env.NEXT_PUBLIC_CENTRY_UNITFLOW_UNIVERSAL_ROUTER || '0xEaF3195bE51861632cd32850973C9515DA48e76F';
const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_CENTRY_GOVERNOR || '';

const FACTORY_ABI = [
  {
    type: 'function', name: 'getAgentAccounts', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'accounts', type: 'address[]' }],
  },
  {
    type: 'function', name: 'createAgentAccount', stateMutability: 'nonpayable',
    inputs: [
      { name: 'templateId', type: 'bytes32' }, { name: 'configHash', type: 'bytes32' },
      { name: 'metadataURI', type: 'string' }, { name: 'initialOperator', type: 'address' },
    ],
    outputs: [{ name: 'agentAccount', type: 'address' }],
  },
];

const ACCOUNT_ABI = [
  { type: 'function', name: 'agentOperators', stateMutability: 'view', inputs: [{ name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function', name: 'setAgentOperator', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'active', type: 'bool' }], outputs: [],
  },
  {
    type: 'function', name: 'setPermission', stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' }, { name: 'target', type: 'address' },
      { name: 'selector', type: 'bytes4' }, { name: 'allowed', type: 'bool' },
      { name: 'expiresAt', type: 'uint64' }, { name: 'maxNativeValue', type: 'uint128' },
    ], outputs: [],
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
  ['agent-management', 'Read agent configuration'],
];

const SUPPORTED_PERMISSION_ASSETS = [CONTRACT_ADDRESSES.USDC, CONTRACT_ADDRESSES.EURC, CONTRACT_ADDRESSES.CIRBTC].filter(Boolean);

function selector(signature) {
  return keccak256(toBytes(signature)).slice(0, 10);
}

const SELECTORS = Object.freeze({
  approve: selector('approve(address,uint256)'),
  supply: selector('supply(address,uint256)'),
  withdraw: selector('withdraw(address,uint256)'),
  borrow: selector('borrow(address,uint256)'),
  repay: selector('repay(address,uint256)'),
  execute: selector('execute(bytes,bytes[],uint256)'),
  castVote: selector('castVote(uint256,uint8)'),
});

function normalizeAddress(value) { return value?.trim() || ''; }

function AgentPageContent() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [selectedAccount, setSelectedAccount] = useState('');
  const [operator, setOperator] = useState('');
  const [scopes, setScopes] = useState(DEFAULT_SCOPES);
  const [swapLimit, setSwapLimit] = useState('');
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const accountsQuery = useReadContract({
    address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getAgentAccounts',
    args: address ? [address] : undefined, query: { enabled: Boolean(FACTORY_ADDRESS && address) },
  });

  const accounts = useMemo(() => accountsQuery.data || [], [accountsQuery.data]);
  const activeAccount = selectedAccount || accounts[0] || '';

  useEffect(() => {
    if (!selectedAccount && accounts[0]) setSelectedAccount(accounts[0]);
  }, [accounts, selectedAccount]);

  useEffect(() => { setPermissionsReady(false); }, [address]);

  const operatorQuery = useReadContract({
    address: activeAccount || undefined, abi: ACCOUNT_ABI, functionName: 'agentOperators',
    args: operator && isAddress(operator) ? [operator] : undefined,
    query: { enabled: Boolean(activeAccount && isAddress(operator)) },
  });

  const operatorAuthorized = operatorQuery.data === true;

  function toggleScope(scope) {
    setPermissionsReady(false);
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  }

  async function createAccount() {
    setError(''); setStatus('');
    if (!address) return setError('Connect your wallet first.');
    if (!FACTORY_ADDRESS) return setError('Agent factory is not configured.');
    if (!isAddress(operator)) return setError('Enter the external agent operator address first.');
    try {
      setStatus('Creating your Centry agent account…');
      const txHash = await writeContractAsync({
        address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'createAgentAccount',
        args: [keccak256(toBytes('centry-external-agent')), keccak256(toBytes('centry-agent-config-v1')), process.env.NEXT_PUBLIC_CENTRY_AGENT_METADATA_URI || '', operator],
      });
      setStatus(`Agent account transaction submitted: ${txHash}`);
      await accountsQuery.refetch();
    } catch (err) {
      setError(err?.shortMessage || err?.message || 'Failed to create the agent account.'); setStatus('');
    }
  }

  async function setOperator(active) {
    setError(''); setStatus('');
    if (!activeAccount) return setError('Create or select an agent account first.');
    if (!isAddress(operator)) return setError('Enter a valid operator address.');
    try {
      setStatus(active ? 'Waiting for wallet approval…' : 'Revoking operator…');
      const txHash = await writeContractAsync({ address: activeAccount, abi: ACCOUNT_ABI, functionName: 'setAgentOperator', args: [operator, active] });
      setStatus(`${active ? 'Operator authorization' : 'Operator revocation'} submitted: ${txHash}`);
      await operatorQuery.refetch(); setPermissionsReady(false);
      if (!active) { setPrompt(''); setConnectionUrl(''); }
    } catch (err) {
      setError(err?.shortMessage || err?.message || `Failed to ${active ? 'authorize' : 'revoke'} the operator.`); setStatus('');
    }
  }

  function buildPermissionPlan() {
    if (!isAddress(operator)) throw new Error('Enter a valid operator address.');
    if (!activeAccount) throw new Error('Create or select an agent account first.');

    const plan = [];
    const seen = new Set();
    const push = (target, selectorValue, maxNativeValue = 0n) => {
      if (!target || !isAddress(target)) throw new Error('A required Centry permission target is not configured.');
      const key = `${target.toLowerCase()}:${selectorValue}:${maxNativeValue.toString()}`;
      if (seen.has(key)) return;
      seen.add(key);
      plan.push({ target, selector: selectorValue, maxNativeValue });
    };

    if (scopes.includes('lend')) {
      for (const asset of SUPPORTED_PERMISSION_ASSETS) push(asset, SELECTORS.approve, 0n);
      push(CONTRACT_ADDRESSES.lendingPool, SELECTORS.supply, 0n);
      push(CONTRACT_ADDRESSES.lendingPool, SELECTORS.withdraw, 0n);
    }
    if (scopes.includes('borrow')) push(CONTRACT_ADDRESSES.lendingPool, SELECTORS.borrow, 0n);
    if (scopes.includes('repay')) {
      for (const asset of SUPPORTED_PERMISSION_ASSETS) push(asset, SELECTORS.approve, 0n);
      push(CONTRACT_ADDRESSES.lendingPool, SELECTORS.repay, 0n);
    }
    if (scopes.includes('swap')) {
      if (!swapLimit) throw new Error('Set a maximum native value per swap before enabling swap permissions.');
      let maxNativeValue;
      try { maxNativeValue = parseUnits(swapLimit, 18); } catch { throw new Error('Swap native-value limit must be a valid USDC amount.'); }
      if (maxNativeValue <= 0n || maxNativeValue > ((1n << 128n) - 1n)) throw new Error('Swap native-value limit is outside the allowed range.');
      push(CONTRACT_ADDRESSES.centryToken, SELECTORS.approve, 0n);
      push(UNIVERSAL_ROUTER, SELECTORS.execute, maxNativeValue);
    }
    if (scopes.includes('governance')) {
      if (!GOVERNOR_ADDRESS || !isAddress(GOVERNOR_ADDRESS)) throw new Error('Governor address is not configured for agent governance.');
      push(GOVERNOR_ADDRESS, SELECTORS.castVote, 0n);
    }
    return plan;
  }

  async function configurePermissions() {
    setError(''); setStatus('');
    if (!operatorAuthorized) return setError('Authorize this operator on the agent account first.');
    if (!publicClient) return setError('Wallet RPC is not ready yet.');
    try {
      const plan = buildPermissionPlan();
      if (!plan.length) return setError('Select at least one state-changing capability first.');
      setStatus(`Configuring ${plan.length} onchain permission${plan.length === 1 ? '' : 's'}…`);
      for (let index = 0; index < plan.length; index += 1) {
        const permission = plan[index];
        setStatus(`Configuring permission ${index + 1} of ${plan.length}…`);
        const hash = await writeContractAsync({
          address: activeAccount, abi: ACCOUNT_ABI, functionName: 'setPermission',
          args: [operator, permission.target, permission.selector, true, 0n, permission.maxNativeValue],
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
      setPermissionsReady(true); setStatus('Onchain permissions are configured for this operator.');
    } catch (err) {
      setPermissionsReady(false); setError(err?.shortMessage || err?.message || 'Failed to configure the onchain permissions.'); setStatus('');
    }
  }

  async function createConnection() {
    setError(''); setStatus(''); setPrompt(''); setConnectionUrl('');
    if (!address || !activeAccount) return setError('Connect your wallet and select an agent account.');
    if (!isAddress(operator)) return setError('Enter the operator address controlled by the external agent.');
    if (!operatorAuthorized) return setError('Authorize this operator on the agent account first.');
    if (!scopes.length) return setError('Select at least one capability.');
    if (scopes.some((scope) => !['read', 'agent-management'].includes(scope)) && !permissionsReady) return setError('Apply the selected onchain permissions before generating the connection.');
    if (!API_BASE) return setError('Agent API URL is not configured.');

    try {
      setStatus('Requesting connection challenge…');
      const challengeResponse = await fetch(`${API_BASE}/api/v1/agent-connections/challenge`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: address, account: activeAccount, scopes }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.error || 'Could not create connection challenge.');
      setStatus('Approve the wallet signature…');
      const signature = await signMessageAsync({ message: challenge.message });
      setStatus('Creating secure agent connection…');
      const connectionResponse = await fetch(`${API_BASE}/api/v1/agent-connections`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeToken: challenge.challengeToken, signature, operator, scopes }),
      });
      const connection = await connectionResponse.json();
      if (!connectionResponse.ok) throw new Error(connection.error || 'Could not create the agent connection.');
      setPrompt(connection.prompt || ''); setConnectionUrl(connection.connectionUrl || '');
      setStatus('Connection ready. Copy the prompt into the external agent.');
    } catch (err) {
      setError(err?.shortMessage || err?.message || 'Failed to create the agent connection.'); setStatus('');
    }
  }

  async function copyPrompt() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setStatus('Connection prompt copied.');
  }

  const hasStateChangingScope = scopes.some((scope) => !['read', 'agent-management'].includes(scope));

  return (
    <div className={styles.page}>
      <div className={styles.header}><div><span className={styles.eyebrow}>EXTERNAL AGENTS</span><h1>Connect an agent</h1><p>Authorize an external AI agent to operate your Centry account through a user-specific Skill connection.</p></div></div>

      {!isConnected ? (
        <section className={styles.card}><h2>Wallet required</h2><p>Connect your wallet before creating or authorizing an agent account.</p></section>
      ) : (
        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.cardTop}><div><h2>1 · Agent operator</h2><p>The operator address is the wallet the external agent will use to sign transactions.</p></div></div>
            <label className={styles.label}>Operator wallet address</label>
            <input className={styles.input} value={operator} onChange={(event) => { setOperator(normalizeAddress(event.target.value)); setPermissionsReady(false); }} placeholder="0x…" spellCheck="false" />
            <p className={styles.hint}>Never enter the operator's private key here.</p>
            {accounts.length ? (
              <>
                <label className={styles.label}>Centry agent account</label>
                <select className={styles.input} value={activeAccount} onChange={(event) => { setSelectedAccount(event.target.value); setPermissionsReady(false); }}>
                  {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
                </select>
                <div className={`${styles.authState} ${operatorAuthorized ? styles.authorized : ''}`}>
                  <span>{operatorAuthorized ? 'Operator authorized' : 'Operator not yet authorized'}</span>
                  {operatorAuthorized ? <button type="button" className={styles.secondaryButton} disabled={isWritePending} onClick={() => setOperator(false)}>Revoke</button> : <button type="button" className={styles.secondaryButton} disabled={isWritePending} onClick={() => setOperator(true)}>Authorize</button>}
                </div>
              </>
            ) : <button type="button" className={styles.primaryButton} disabled={isWritePending} onClick={createAccount}>Create agent account</button>}
          </section>

          <section className={styles.card}>
            <div className={styles.cardTop}><div><h2>2 · Connection scope</h2><p>Choose what this connection is allowed to request from Centry.</p></div></div>
            <div className={styles.scopeList}>
              {OPTIONAL_SCOPES.map(([scope, description]) => (
                <label key={scope} className={styles.scopeRow}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} /><span><strong>{scope}</strong><small>{description}</small></span></label>
              ))}
            </div>
            {scopes.includes('swap') ? <><label className={styles.label}>Max native value per swap</label><input className={styles.input} value={swapLimit} onChange={(event) => { setSwapLimit(event.target.value); setPermissionsReady(false); }} placeholder="e.g. 100" inputMode="decimal" /><p className={styles.hint}>USDC amount per swap, converted to Arc's native 18-decimal value limit.</p></> : null}
            {hasStateChangingScope ? <button type="button" className={styles.secondaryButton} disabled={isWritePending || !operatorAuthorized} onClick={configurePermissions}>{permissionsReady ? 'Permissions configured' : 'Apply onchain permissions'}</button> : null}
            <button type="button" className={styles.primaryButton} disabled={isWritePending || !operatorAuthorized || (hasStateChangingScope && !permissionsReady)} onClick={createConnection}>Generate connection prompt</button>
          </section>
        </div>
      )}

      {status ? <div className={styles.notice}>{status}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      {prompt ? <section className={styles.card}>
        <div className={styles.cardTop}><div><h2>3 · Copy into your agent</h2><p>The external agent fetches the user-specific Skill URL, establishes a short-lived session, then uses only the returned capabilities.</p></div><button type="button" className={styles.secondaryButton} onClick={copyPrompt}>Copy prompt</button></div>
        <div className={styles.promptBox}><pre>{prompt}</pre></div>
        <div className={styles.connectionMeta}><span>Connection URL</span><code>{connectionUrl}</code></div>
        <p className={styles.hint}>The connection expires quickly. Generate a new one when you need to connect another agent session.</p>
      </section> : null}
    </div>
  );
}

export default function AgentsPage() {
  return <Providers><AppShell><AgentPageContent /></AppShell></Providers>;
}
