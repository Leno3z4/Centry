'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useSendTransaction, useSignMessage, useWriteContract } from 'wagmi';
import { encodeFunctionData, isAddress, keccak256, parseUnits, toBytes } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';
import styles from './agents.module.css';

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_CENTRY_AGENT_FACTORY || '';
const RUNNER_ADDRESS = process.env.NEXT_PUBLIC_CENTRY_AGENT_RUNNER_ADDRESS || '';
const API_BASE = (process.env.NEXT_PUBLIC_CENTRY_AGENT_API_URL || '').replace(/\/$/, '');
const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_CENTRY_AGENT_PAYWALL === 'true';
const AGENT_PRICE_RAW = 2500000n;

const FACTORY_ABI = [
  { type: 'function', name: 'getAgentAccounts', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: 'accounts', type: 'address[]' }] },
  { type: 'function', name: 'createAgentAccount', stateMutability: 'nonpayable', inputs: [{ name: 'templateId', type: 'bytes32' }, { name: 'configHash', type: 'bytes32' }, { name: 'metadataURI', type: 'string' }, { name: 'initialOperator', type: 'address' }], outputs: [{ name: 'agentAccount', type: 'address' }] },
  { type: 'function', name: 'purchaseAndCreateAgentAccount', stateMutability: 'nonpayable', inputs: [{ name: 'templateId', type: 'bytes32' }, { name: 'configHash', type: 'bytes32' }, { name: 'metadataURI', type: 'string' }, { name: 'initialOperator', type: 'address' }], outputs: [{ name: 'agentAccount', type: 'address' }] },
];

const ERC20_ABI = [
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const ACCOUNT_ABI = [
  { type: 'function', name: 'active', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'agentOperators', stateMutability: 'view', inputs: [{ name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setActive', stateMutability: 'nonpayable', inputs: [{ name: 'active', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'setAgentOperator', stateMutability: 'nonpayable', inputs: [{ name: 'operator', type: 'address' }, { name: 'active', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'withdrawNative', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdrawToken', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'transferToAgent', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'setPermission', stateMutability: 'nonpayable', inputs: [{ name: 'operator', type: 'address' }, { name: 'target', type: 'address' }, { name: 'selector', type: 'bytes4' }, { name: 'allowed', type: 'bool' }, { name: 'expiresAt', type: 'uint64' }, { name: 'maxNativeValue', type: 'uint256' }], outputs: [] },
];

const DEFAULT_SCOPES = ['read', 'lend', 'borrow', 'repay', 'swap'];
const WITHDRAWABLE_ASSETS = [
  { key: 'native', label: 'USDC (native)', decimals: 18, address: null },
  { key: 'cent', label: 'CENT', decimals: 18, address: CONTRACT_ADDRESSES.centryToken },
  { key: 'eurc', label: 'EURC', decimals: 6, address: CONTRACT_ADDRESSES.EURC },
  { key: 'cirbtc', label: 'cirBTC', decimals: 8, address: CONTRACT_ADDRESSES.CIRBTC },
];

const scopeOptions = [
  ['read', 'Read balances, positions and markets'],
  ['lend', 'Supply and withdraw'],
  ['borrow', 'Borrow assets'],
  ['repay', 'Repay debt'],
  ['swap', 'Swap CENT and Arc-native USDC'],
  ['governance', 'Governance actions'],
  ['agent-to-agent', 'Send tasks/messages to other Centry agents'],
];

const providerOptions = [
  ['gemini', 'Gemini'],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
];

const AGENT_ACTION_OPTIONS = [
  ['supply', 'Supply', 'Supply assets into Centry lending'],
  ['withdraw', 'Withdraw', 'Withdraw supplied assets'],
  ['borrow', 'Borrow', 'Open or increase borrowing'],
  ['repay', 'Repay', 'Repay existing debt'],
  ['swap', 'Swap', 'Swap CENT and Arc-native USDC'],
  ['castVote', 'Governance', 'Cast governance votes'],
  ['transfer', 'Agent transfer', 'Move supported assets between your own agents'],
];

const AGENT_ASSET_OPTIONS = [
  ['USDC', 'USDC'],
  ['EURC', 'EURC'],
  ['CIRBTC', 'cirBTC'],
  ['CENT', 'CENT'],
];

function randomAgentId() {
  return crypto.randomUUID();
}

async function apiJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`);
  return body;
}

function Section({ title, description, children }) {
  return (
    <section className={styles.card}>
      <div className={styles.sectionHead}>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function AgentCard({ agent, onSelect, selected }) {
  return (
    <button type="button" className={`${styles.agentCard} ${selected ? styles.agentCardSelected : ''}`} onClick={() => onSelect(agent)}>
      <div className={styles.agentCardTop}>
        <div>
          <strong>{agent.name}</strong>
          <span>{agent.type === 'unregistered' ? 'Unregistered agent account' : 'Centry agent'}</span>
        </div>
        <span className={agent.active ? styles.statusOn : styles.statusOff}>{agent.active ? 'ON' : 'OFF'}</span>
      </div>
      <div className={styles.address}>{agent.account}</div>
    </button>
  );
}

function AgentPageContent() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync, isPending } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [accounts, setAccounts] = useState([]);
  const [managed, setManaged] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [tab, setTab] = useState('agents');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');


  const [provider, setProvider] = useState('gemini');
  const [model, setModel] = useState('');
  const [providerKey, setProviderKey] = useState('');

  const [apiKeyLabel, setApiKeyLabel] = useState('External AI');
  const [apiKeyOperator, setApiKeyOperator] = useState('');
  const [apiKeyScopes, setApiKeyScopes] = useState(DEFAULT_SCOPES);
  const [newApiKey, setNewApiKey] = useState('');

  const [activity, setActivity] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatProvider, setChatProvider] = useState('gemini');
  const [fundAsset, setFundAsset] = useState('native');
  const [fundAmount, setFundAmount] = useState('');
  const [withdrawAsset, setWithdrawAsset] = useState('native');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [autonomyEnabled, setAutonomyEnabled] = useState(true);
  const [autonomyInstructions, setAutonomyInstructions] = useState('');
  const [autonomyMaxActions, setAutonomyMaxActions] = useState('4');
  const [autonomySlippage, setAutonomySlippage] = useState('50');
  const [allowedActions, setAllowedActions] = useState(AGENT_ACTION_OPTIONS.map(([value]) => value));
  const [allowedAssets, setAllowedAssets] = useState(AGENT_ASSET_OPTIONS.map(([value]) => value));
  const [maxAmountByAsset, setMaxAmountByAsset] = useState({ USDC: '', EURC: '', CIRBTC: '', CENT: '' });
  const [configuredProviders, setConfiguredProviders] = useState([]);
  const [internalTarget, setInternalTarget] = useState('');
  const [internalAsset, setInternalAsset] = useState('USDC');
  const [internalAmount, setInternalAmount] = useState('');

  const factoryAccounts = useReadContract({
    address: FACTORY_ADDRESS || undefined,
    abi: FACTORY_ABI,
    functionName: 'getAgentAccounts',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && FACTORY_ADDRESS) },
  });

  async function ownerAuth(account, action) {
    if (!API_BASE) throw new Error('Agent API URL is not configured.');
    const challenge = await apiJson(`${API_BASE}/api/v1/agent-admin/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: address, account, action }),
    });
    const signature = await signMessageAsync({ message: challenge.message });
    return { challengeToken: challenge.token, signature };
  }

  async function refreshAgents() {
    if (!address) return;
    const rawAccounts = FACTORY_ADDRESS && publicClient
      ? (await publicClient.readContract({ address: FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: 'getAgentAccounts', args: [address] })).map(String)
      : [];
    setAccounts(rawAccounts);
    const hydrated = [];
    for (const account of rawAccounts) {
      try {
        const body = await apiJson(`${API_BASE}/api/v1/agents/account/${account}`);
        hydrated.push(body);
      } catch {
        hydrated.push({
          id: account,
          account,
          owner: address,
          name: 'Unregistered agent',
          description: 'Agent account created onchain; finish registration to configure it.',
          type: 'unregistered',
          active: false,
        });
      }
    }
    setManaged(hydrated);
    setSelectedAgent((current) => hydrated.find((item) => item.account === current?.account) || hydrated[0] || null);
  }

  useEffect(() => { refreshAgents().catch((e) => setError(e.message)); }, [factoryAccounts.data, address]);

  useEffect(() => {
    const autonomy = selectedAgent?.config?.autonomy;
    const policy = selectedAgent?.config?.policy;
    if (autonomy) {
      setAutonomyEnabled(autonomy.enabled !== false);
      setAutonomyInstructions(autonomy.instructions || '');
      setAutonomyMaxActions(String(autonomy.maxActions || 4));
      setAutonomySlippage(String(autonomy.slippageBps ?? 50));
      if (autonomy.provider) setProvider(autonomy.provider);
    }
    if (policy) {
      setAllowedActions(Array.isArray(policy.allowedActions) && policy.allowedActions.length ? policy.allowedActions : AGENT_ACTION_OPTIONS.map(([value]) => value));
      setAllowedAssets(Array.isArray(policy.allowedAssets) && policy.allowedAssets.length ? policy.allowedAssets : AGENT_ASSET_OPTIONS.map(([value]) => value));
      setMaxAmountByAsset({
        USDC: String(policy.maxAmountByAsset?.USDC || ''),
        EURC: String(policy.maxAmountByAsset?.EURC || ''),
        CIRBTC: String(policy.maxAmountByAsset?.CIRBTC || ''),
        CENT: String(policy.maxAmountByAsset?.CENT || ''),
      });
    } else {
      setAllowedActions(AGENT_ACTION_OPTIONS.map(([value]) => value));
      setAllowedAssets(AGENT_ASSET_OPTIONS.map(([value]) => value));
      setMaxAmountByAsset({ USDC: '', EURC: '', CIRBTC: '', CENT: '' });
    }
  }, [selectedAgent?.account, selectedAgent?.config]);

  useEffect(() => {
    if (!selectedAgent || !API_BASE) {
      setConfiguredProviders([]);
      return;
    }
    apiJson(API_BASE + '/api/v1/agents/' + selectedAgent.id + '/providers')
      .then((body) => setConfiguredProviders(body.providers || []))
      .catch(() => setConfiguredProviders([]));
  }, [selectedAgent?.id]);

  async function toggleAgent() {
    if (!selectedAgent) return;
    setError('');
    setStatus('');
    try {
      setStatus(`${selectedAgent.active ? 'Turning off' : 'Activating'} agent… Approve the wallet transaction.`);
      const hash = await writeContractAsync({
        address: selectedAgent.account,
        abi: ACCOUNT_ABI,
        functionName: 'setActive',
        args: [!selectedAgent.active],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus(selectedAgent.active ? 'Agent switched off.' : 'Agent activated.');
      await refreshAgents();
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Agent activation failed.');
      setStatus('');
    }
  }

  async function authorizeOperator() {
    if (!selectedAgent || !apiKeyOperator) return setError('Enter an operator address.');
    if (!isAddress(apiKeyOperator)) return setError('Operator address is invalid.');
    try {
      setStatus('Authorizing operator… Approve the wallet transaction.');
      const hash = await writeContractAsync({
        address: selectedAgent.account,
        abi: ACCOUNT_ABI,
        functionName: 'setAgentOperator',
        args: [apiKeyOperator, true],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus('Operator authorized.');
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Operator authorization failed.');
    }
  }

  async function createAgent() {
    if (!FACTORY_ADDRESS) return setError('Agent factory is not deployed/configured yet.');
    if (!publicClient) return setError('Wallet RPC is not ready.');
    if (!isAddress(RUNNER_ADDRESS)) return setError('Centry hosted agent runner is not configured yet.');

    setError('');
    setStatus('');
    try {
      const agentId = randomAgentId();
      const templateHash = keccak256(toBytes('centry-general-agent'));
      const configHash = keccak256(toBytes('centry-general-agent-config-v1'));
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

        setStatus('Creating purchased agent… Approve the factory transaction.');
        creationTx = await writeContractAsync({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: 'purchaseAndCreateAgentAccount',
          args: [templateHash, configHash, '', RUNNER_ADDRESS],
        });
      } else {
        setStatus('Creating your free agent… Approve the factory transaction.');
        creationTx = await writeContractAsync({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: 'createAgentAccount',
          args: [templateHash, configHash, '', RUNNER_ADDRESS],
        });
      }

      await publicClient.waitForTransactionReceipt({ hash: creationTx });

      const updated = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'getAgentAccounts',
        args: [address],
      });
      const account = updated.map(String).at(-1);
      if (!account) throw new Error('Agent account was not returned by the factory.');

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

      const auth = await ownerAuth(account, 'register-agent');
      await apiJson(`${API_BASE}/api/v1/agents/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          owner: address,
          account,
          agentId,
          type: PAYWALL_ENABLED ? 'purchased' : 'standard',
          name: 'Centry Agent',
          description: 'Configurable Centry onchain agent.',
          operator: RUNNER_ADDRESS,
          priceUsdCents: PAYWALL_ENABLED ? 250 : 0,
        }),
      });

      setStatus(PAYWALL_ENABLED
        ? 'Purchased agent created. It is OFF until you activate it.'
        : 'Free agent created. It is OFF until you activate it.');
      await refreshAgents();
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Agent creation failed.');
      setStatus('');
    }
  }


  async function fundAgent() {
    if (!selectedAgent) return;
    const asset = WITHDRAWABLE_ASSETS.find((item) => item.key === fundAsset);
    if (!asset) return setError('Unsupported funding asset.');
    if (!fundAmount || Number(fundAmount) <= 0) return setError('Enter a funding amount.');

    setError('');
    setStatus('Preparing funding… Approve the wallet transaction.');
    try {
      const rawAmount = parseUnits(fundAmount, asset.decimals);
      const hash = asset.address
        ? await writeContractAsync({
            address: asset.address,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [selectedAgent.account, rawAmount],
          })
        : await sendTransactionAsync({
            to: selectedAgent.account,
            value: rawAmount,
            chainId: 5042,
          });

      await publicClient.waitForTransactionReceipt({ hash });
      setFundAmount('');
      setStatus(fundAmount + ' ' + asset.label + ' funded to the agent smart account.');
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Agent funding failed.');
      setStatus('');
    }
  }

  async function withdrawFromAgent() {
    if (!selectedAgent) return;
    const asset = WITHDRAWABLE_ASSETS.find((item) => item.key === withdrawAsset);
    if (!asset) return setError('Unsupported withdrawal asset.');
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return setError('Enter a withdrawal amount.');

    setError('');
    setStatus('Preparing withdrawal… Approve the wallet transaction.');
    try {
      const rawAmount = parseUnits(withdrawAmount, asset.decimals);
      const hash = asset.address
        ? await writeContractAsync({
            address: selectedAgent.account,
            abi: ACCOUNT_ABI,
            functionName: 'withdrawToken',
            args: [asset.address, rawAmount],
          })
        : await writeContractAsync({
            address: selectedAgent.account,
            abi: ACCOUNT_ABI,
            functionName: 'withdrawNative',
            args: [rawAmount],
          });

      await publicClient.waitForTransactionReceipt({ hash });
      setWithdrawAmount('');
      setStatus(withdrawAmount + ' ' + asset.label + ' withdrawn to your wallet.');
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Agent withdrawal failed.');
      setStatus('');
    }
  }

  async function saveAutonomy() {
    if (!selectedAgent) return;
    if (!allowedActions.length) return setError('Select at least one allowed action.');
    if (!allowedAssets.length) return setError('Select at least one allowed asset.');
    try {
      const auth = await ownerAuth(selectedAgent.account, 'configure-agent');
      await apiJson(API_BASE + '/api/v1/agents/' + selectedAgent.id + '/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...auth,
          owner: address,
          autonomy: {
            enabled: autonomyEnabled,
            provider,
            instructions: autonomyInstructions,
            maxActions: Number(autonomyMaxActions),
            slippageBps: Number(autonomySlippage),
          },
          policy: {
            allowedActions,
            allowedAssets,
            maxAmountByAsset: Object.fromEntries(Object.entries(maxAmountByAsset).filter(([, value]) => String(value || '').trim())),
          },
        }),
      });
      setStatus('Agent behavior policy saved.');
      await refreshAgents();
    } catch (e) { setError(e.message); }
  }

  async function allowAgentAutomation() {
    if (!selectedAgent || !isAddress(RUNNER_ADDRESS)) return setError('Hosted runner address is not configured.');
    const selectors = (signature) => '0x' + keccak256(toBytes(signature)).slice(2, 10);
    try {
      setStatus('Authorizing the hosted runner for agent-to-agent transfers…');
      const hash = await writeContractAsync({ address: selectedAgent.account, abi: ACCOUNT_ABI, functionName: 'setAgentOperator', args: [RUNNER_ADDRESS, true] });
      await publicClient.waitForTransactionReceipt({ hash });
      const permissions = [
        [selectedAgent.account, selectors('transferToAgent(address,address,uint256)')],
        [CONTRACT_ADDRESSES.lendingPool, selectors('supply(address,uint256)')],
        [CONTRACT_ADDRESSES.lendingPool, selectors('withdraw(address,uint256)')],
        [CONTRACT_ADDRESSES.lendingPool, selectors('borrow(address,uint256)')],
        [CONTRACT_ADDRESSES.lendingPool, selectors('repay(address,uint256)')],
        [CONTRACT_ADDRESSES.USDC, selectors('approve(address,uint256)')],
        [CONTRACT_ADDRESSES.EURC, selectors('approve(address,uint256)')],
        [CONTRACT_ADDRESSES.CIRBTC, selectors('approve(address,uint256)')],
        [CONTRACT_ADDRESSES.centryToken, selectors('approve(address,uint256)')],
        [CONTRACT_ADDRESSES.unitFlowRouter, selectors('exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))')],
      ];
      for (const [target, selector] of permissions) {
        const permissionHash = await writeContractAsync({ address: selectedAgent.account, abi: ACCOUNT_ABI, functionName: 'setPermission', args: [RUNNER_ADDRESS, target, selector, true, 0, 0n] });
        await publicClient.waitForTransactionReceipt({ hash: permissionHash });
      }
      setStatus('Hosted automation and internal agent transfers are authorized for the standard Centry actions.');
    } catch (e) { setError(e?.shortMessage || e?.message || 'Automation authorization failed.'); }
  }

  async function sendToInternalAgent() {
    if (!selectedAgent || !internalTarget) return setError('Select another agent.');
    const target = managed.find((item) => item.id === internalTarget);
    if (!target || target.account === selectedAgent.account || String(target.owner).toLowerCase() !== String(address).toLowerCase()) return setError('That agent is not another agent owned by this wallet.');
    const asset = internalAsset === 'CENT' ? { decimals: 18, address: CONTRACT_ADDRESSES.centryToken, label: 'CENT' } : internalAsset === 'USDC' ? { decimals: 6, address: CONTRACT_ADDRESSES.USDC, label: 'USDC' } : internalAsset === 'EURC' ? { decimals: 6, address: CONTRACT_ADDRESSES.EURC, label: 'EURC' } : internalAsset === 'CIRBTC' ? { decimals: 8, address: CONTRACT_ADDRESSES.CIRBTC, label: 'cirBTC' } : null;
    if (!asset || !internalAmount || Number(internalAmount) <= 0) return setError('Enter a valid asset and amount.');
    try {
      const amount = parseUnits(internalAmount, asset.decimals);
      const hash = await writeContractAsync({ address: selectedAgent.account, abi: ACCOUNT_ABI, functionName: 'transferToAgent', args: [asset.address || CONTRACT_ADDRESSES.USDC, target.account, amount] });
      await publicClient.waitForTransactionReceipt({ hash });
      setInternalAmount('');
      setStatus('Transfer completed to ' + target.name + '.');
    } catch (e) { setError(e?.shortMessage || e?.message || 'Internal agent transfer failed.'); }
  }
  async function configureProvider() {
    if (!selectedAgent) return;
    if (!model || !providerKey) return setError('Provider, model and API key are required.');
    try {
      const auth = await ownerAuth(selectedAgent.account, 'configure-ai-provider');
      await apiJson(`${API_BASE}/api/v1/agents/${selectedAgent.id}/providers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...auth, provider, model, apiKey: providerKey }),
      });
      setProviderKey('');
      const next = await apiJson(API_BASE + '/api/v1/agents/' + selectedAgent.id + '/providers');
      setConfiguredProviders(next.providers || []);
      setStatus(provider + ' is configured for this agent.');
    } catch (e) {
      setError(e.message);
    }
  }

  async function generateApiKey() {
    if (!selectedAgent) return;
    if (!isAddress(apiKeyOperator)) return setError('Enter the external agent operator address.');
    try {
      const auth = await ownerAuth(selectedAgent.account, 'create-api-key');
      const result = await apiJson(`${API_BASE}/api/v1/agents/${selectedAgent.id}/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...auth, owner: address, operator: apiKeyOperator, label: apiKeyLabel, scopes: apiKeyScopes }),
      });
      setNewApiKey(result.key);
      setStatus('API key created. Copy it now; it will not be displayed again.');
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadActivity() {
    if (!selectedAgent) return;
    try {
      const auth = await ownerAuth(selectedAgent.account, 'agent-analytics');
      const result = await apiJson(`${API_BASE}/api/v1/agents/${selectedAgent.id}/activity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(auth),
      });
      setActivity(result.activity || []);
    } catch (e) {
      setError(e.message);
    }
  }

  async function sendChat() {
    if (!selectedAgent || !chatInput.trim()) return;
    try {
      const auth = await ownerAuth(selectedAgent.account, 'agent-chat');
      const result = await apiJson(`${API_BASE}/api/v1/agents/${selectedAgent.id}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...auth, message: chatInput.trim(), provider: chatProvider }),
      });
      setChatMessages((current) => [...current, { role: 'user', content: chatInput.trim() }, { role: 'assistant', content: result.answer }]);
      setChatInput('');
    } catch (e) {
      setError(e.message);
    }
  }

  async function generateExternalPrompt() {
    if (!selectedAgent) return;
    if (!isAddress(apiKeyOperator)) return setError('Enter the external agent operator address.');
    try {
      const challenge = await apiJson(`${API_BASE}/api/v1/agent-connections/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: address, account: selectedAgent.account, scopes: apiKeyScopes }),
      });
      const signature = await signMessageAsync({ message: challenge.message });
      const result = await apiJson(`${API_BASE}/api/v1/agent-connections`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challengeToken: challenge.challengeToken, signature, operator: apiKeyOperator, scopes: apiKeyScopes }),
      });
      const prompt = result.prompt || `Activate this Centry agent by calling ${result.connectionUrl} with ?operator=${apiKeyOperator}`;
      await navigator.clipboard.writeText(prompt);
      setStatus('External-agent activation prompt generated and copied.');
    } catch (e) {
      setError(e.message);
    }
  }

  const availableTabs = useMemo(() => ['agents', 'configure', 'internal', 'external', 'analytics', 'chat'], []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Agents</h1>
          <p>Own, configure, activate, pause and connect onchain agents without giving them your owner key.</p>
        </div>
        {selectedAgent ? (
          <div className={styles.headerActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => setTab('configure')}>Configure agent</button>
            <button type="button" className={styles.toggleButton} disabled={isPending} onClick={toggleAgent}>
              {selectedAgent.active ? 'Switch agent off' : 'Activate agent'}
            </button>
          </div>
        ) : null}
      </header>

      <nav className={styles.tabs}>
        {availableTabs.map((item) => <button key={item} type="button" className={tab === item ? styles.tabActive : styles.tab} onClick={() => setTab(item)}>{item === 'agents' ? 'My agents' : item === 'configure' ? 'Configure' : item === 'internal' ? 'Agent network' : item === 'external' ? 'External agent' : item === 'analytics' ? 'Analytics' : 'Agent chat'}</button>)}
      </nav>

      {status ? <div className={styles.notice}>{status}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {tab === 'agents' ? (
        <>
          <Section title="Your agents" description="Centry agents are tied to your Centry account. Every new agent starts OFF and requires a wallet transaction to activate.">
            {!FACTORY_ADDRESS ? <div className={styles.warning}>Agent factory is not configured yet. Deploy <code>CentryOnchainAgentFactory</code> first, then set <code>NEXT_PUBLIC_CENTRY_AGENT_FACTORY</code>.</div> : null}
            <div className={styles.agentGrid}>
              {managed.length ? managed.map((agent) => <AgentCard key={agent.account} agent={agent} onSelect={setSelectedAgent} selected={selectedAgent?.account === agent.account} />) : <div className={styles.empty}>No agent accounts yet.</div>}
            </div>
          </Section>


          <Section title="Fund agent" description="Send funds from your connected wallet directly to the selected agent smart account. These funds are what the agent can use for its permitted interactions.">
            {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
              <>
                <div className={styles.formGrid}>
                  <div>
                    <label className={styles.label}>Asset</label>
                    <select className={styles.input} value={fundAsset} onChange={(e) => setFundAsset(e.target.value)}>
                      {WITHDRAWABLE_ASSETS.map((asset) => <option key={asset.key} value={asset.key}>{asset.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={styles.label}>Amount</label>
                    <input className={styles.input} inputMode="decimal" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <button type="button" className={styles.primaryButton} disabled={isPending || !isConnected} onClick={fundAgent}>Fund selected agent</button>
                <p className={styles.hint}>Native USDC uses Arc's native balance for the transfer. ERC-20 assets use their token contract. Funding the agent account is separate from supplying assets into Centry's lending pool.</p>
              </>
            )}
          </Section>

          <Section title="Withdraw from agent" description="Withdraw funds from the selected agent back to the wallet that owns the agent. This works even while the agent is OFF.">
            {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
              <>
                <div className={styles.formGrid}>
                  <div>
                    <label className={styles.label}>Asset</label>
                    <select className={styles.input} value={withdrawAsset} onChange={(e) => setWithdrawAsset(e.target.value)}>
                      {WITHDRAWABLE_ASSETS.map((asset) => <option key={asset.key} value={asset.key}>{asset.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={styles.label}>Amount</label>
                    <input className={styles.input} inputMode="decimal" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <button type="button" className={styles.secondaryButton} disabled={isPending} onClick={withdrawFromAgent}>Withdraw to my wallet</button>
              </>
            )}
          </Section>
          <Section title="Agent store" description={PAYWALL_ENABLED ? 'Purchased agents cost 2.50 USDC on Arc Mainnet. Payment goes to the configured Centry treasury.' : 'Centry agents are free for now. The paywall is kept available for when you are ready to charge.'}>
            <div className={styles.storeCard}>
              <div>
                <strong>Centry Agent</strong>
                <p>Configurable onchain agent with lending, repayment, swap and external-agent connectivity.</p>
              </div>
              <div className={styles.price}>{PAYWALL_ENABLED ? '$2.50' : 'Free'}</div>
            </div>
            <div className={styles.hint}>{PAYWALL_ENABLED ? 'Your purchased agent gets its own smart-account wallet, owned by your connected wallet. Centry’s hosted runner is authorized as its execution operator; you never give Centry your owner private key.' : 'Your free agent gets its own smart-account wallet, owned by your connected wallet. Centry’s hosted runner is authorized as its execution operator; you never give Centry your owner private key. No payment is required while the paywall is disabled.'}</div>
            <button type="button" className={styles.primaryButton} disabled={isPending || !isConnected || !isAddress(RUNNER_ADDRESS)} onClick={createAgent}>{PAYWALL_ENABLED ? 'Purchase and create' : 'Create free agent'}</button>
          </Section>
        </>
      ) : null}

      {tab === 'configure' ? (
        <>
          <Section title="AI provider" description="Choose the model that reasons for this agent and store its provider credential securely.">
            {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
              <>
                <div className={styles.formGrid}>
                  <div>
                    <label className={styles.label}>Provider</label>
                    <select className={styles.input} value={provider} onChange={(e) => setProvider(e.target.value)}>
                      {providerOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={styles.label}>Model</label>
                    <input className={styles.input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. gemini-3.1-flash-lite" />
                  </div>
                </div>
                <label className={styles.label}>Provider API key</label>
                <input className={styles.input} type="password" value={providerKey} onChange={(e) => setProviderKey(e.target.value)} placeholder="Paste your Gemini, OpenAI or Anthropic API key" />
                <div className={styles.rowBetween}>
                  <p className={styles.hint}>{configuredProviders.length ? 'Configured: ' + configuredProviders.map((item) => item.provider + ' · ' + item.model).join(', ') : 'No provider credentials saved for this agent yet.'}</p>
                  <button type="button" className={styles.primaryButton} onClick={configureProvider}>Save provider</button>
                </div>
                <p className={styles.hint}>Your raw API key is encrypted server-side and is not returned to the browser after storage.</p>
              </>
            )}
          </Section>

          <Section title="Agent behavior" description="Configure what the agent can do, what it should do, and the limits the hosted runner enforces before simulation.">
            {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
              <>
                <label className={styles.scope}>
                  <input type="checkbox" checked={autonomyEnabled} onChange={(e) => setAutonomyEnabled(e.target.checked)} />
                  <span><strong>Allow autonomous runs</strong><small>When OFF, the runner wakes the agent but does not execute AI-driven work.</small></span>
                </label>
                <label className={styles.label}>Strategy / instructions</label>
                <textarea className={styles.textarea} rows={8} value={autonomyInstructions} onChange={(e) => setAutonomyInstructions(e.target.value)} placeholder="Example: supply idle USDC, never borrow, keep enough native USDC for gas, and only swap CENT when the specified condition is met." />
                <div className={styles.formGrid}>
                  <div>
                    <label className={styles.label}>Provider used for autonomy</label>
                    <select className={styles.input} value={provider} onChange={(e) => setProvider(e.target.value)}>
                      {providerOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={styles.label}>Max actions per run</label>
                    <input className={styles.input} inputMode="numeric" value={autonomyMaxActions} onChange={(e) => setAutonomyMaxActions(e.target.value)} />
                  </div>
                  <div>
                    <label className={styles.label}>Swap slippage (bps)</label>
                    <input className={styles.input} inputMode="numeric" value={autonomySlippage} onChange={(e) => setAutonomySlippage(e.target.value)} />
                  </div>
                </div>
                <label className={styles.label}>Allowed actions</label>
                <div className={styles.scopeGrid}>
                  {AGENT_ACTION_OPTIONS.map(([value, label, description]) => (
                    <label key={value} className={styles.scope}>
                      <input type="checkbox" checked={allowedActions.includes(value)} onChange={() => setAllowedActions((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />
                      <span><strong>{label}</strong><small>{description}</small></span>
                    </label>
                  ))}
                </div>
                <p className={styles.hint}>Token approvals are treated as prerequisites for allowed actions rather than a separate user-facing behavior.</p>
                <label className={styles.label}>Allowed assets</label>
                <div className={styles.scopeGrid}>
                  {AGENT_ASSET_OPTIONS.map(([value, label]) => (
                    <label key={value} className={styles.scope}>
                      <input type="checkbox" checked={allowedAssets.includes(value)} onChange={() => setAllowedAssets((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />
                      <span><strong>{label}</strong><small>May be used by the allowed actions.</small></span>
                    </label>
                  ))}
                </div>
                <label className={styles.label}>Maximum amount per action</label>
                <div className={styles.formGrid}>
                  {AGENT_ASSET_OPTIONS.map(([value, label]) => (
                    <div key={value}>
                      <label className={styles.label}>{label}</label>
                      <input className={styles.input} inputMode="decimal" value={maxAmountByAsset[value] || ''} onChange={(e) => setMaxAmountByAsset((current) => ({ ...current, [value]: e.target.value }))} placeholder={value === 'CIRBTC' ? 'e.g. 0.01' : value === 'CENT' ? 'e.g. 1000' : 'Leave blank for no cap'} />
                    </div>
                  ))}
                </div>
                <div className={styles.rowBetween}>
                  <p className={styles.hint}>Amount caps apply per action. Blank means no application-level cap; the smart-account policy remains the final boundary.</p>
                  <button type="button" className={styles.primaryButton} onClick={saveAutonomy}>Save behavior policy</button>
                </div>
              </>
            )}
          </Section>

          <Section title="Hosted execution" description="Authorize Centry's dedicated runner as an operator and apply the standard onchain permissions for this agent.">
            {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
              <>
                <div className={styles.storeCard}>
                  <div><strong>Runner</strong><p>{RUNNER_ADDRESS || 'Not configured'}</p></div>
                  <div className={styles.price}>Arc · 5042</div>
                </div>
                <button type="button" className={styles.secondaryButton} onClick={allowAgentAutomation}>Authorize hosted runner + selected permissions</button>
                <p className={styles.hint}>This is owner-signed. The runner never receives your owner private key.</p>
              </>
            )}
          </Section>

          <Section title="Agent API access" description="Create a persistent credential for an external AI agent. The raw key is shown once and stored only as a hash.">
            {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
              <>
                <label className={styles.label}>External agent operator address</label>
                <input className={styles.input} value={apiKeyOperator} onChange={(e) => setApiKeyOperator(e.target.value)} placeholder="0x…" />
                <label className={styles.label}>Key label</label>
                <input className={styles.input} value={apiKeyLabel} onChange={(e) => setApiKeyLabel(e.target.value)} placeholder="External AI" />
                <label className={styles.label}>API capabilities</label>
                <div className={styles.scopeGrid}>
                  {scopeOptions.map(([scope, description]) => (
                    <label key={scope} className={styles.scope}>
                      <input type="checkbox" checked={apiKeyScopes.includes(scope)} onChange={() => setApiKeyScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])} />
                      <span><strong>{scope}</strong><small>{description}</small></span>
                    </label>
                  ))}
                </div>
                <button type="button" className={styles.secondaryButton} onClick={generateApiKey}>Generate API key</button>
                {newApiKey ? <div className={styles.secretBox}><div>Copy once</div><code>{newApiKey}</code></div> : null}
              </>
            )}
          </Section>
        </>
      ) : null}

      {tab === 'internal' ? (
        <Section title="Agent network" description="Agents belonging to this same wallet can communicate and move supported tokens between their own agent wallets. External agent addresses are rejected by the onchain agent contract.">
          {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
            <>
              <div className={styles.formGrid}><div><label className={styles.label}>Send from</label><div className={styles.input}>{selectedAgent.name}</div></div><div><label className={styles.label}>Send to</label><select className={styles.input} value={internalTarget} onChange={(e) => setInternalTarget(e.target.value)}><option value="">Select another agent</option>{managed.filter((item) => item.account !== selectedAgent.account && String(item.owner).toLowerCase() === String(address).toLowerCase()).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.account.slice(0, 8)}…</option>)}</select></div></div>
              <div className={styles.formGrid}><div><label className={styles.label}>Asset</label><select className={styles.input} value={internalAsset} onChange={(e) => setInternalAsset(e.target.value)}><option value="USDC">USDC</option><option value="CENT">CENT</option><option value="EURC">EURC</option><option value="CIRBTC">cirBTC</option></select></div><div><label className={styles.label}>Amount</label><input className={styles.input} inputMode="decimal" value={internalAmount} onChange={(e) => setInternalAmount(e.target.value)} placeholder="0.00" /></div></div>
              <button type="button" className={styles.primaryButton} disabled={isPending} onClick={sendToInternalAgent}>Send to agent</button>
              <p className={styles.hint}>This is an owner-signed transfer for now. Autonomous transfers use the same onchain recipient restriction and can only target another agent owned by this wallet.</p>
            </>
          )}
        </Section>
      ) : null}
      {tab === 'external' ? (
        <Section title="External agent connection" description="Give an outside AI agent a user-scoped API or a short-lived activation prompt. The agent never receives your Centry owner key.">
          {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
            <>
              <label className={styles.label}>External agent operator</label>
              <input className={styles.input} value={apiKeyOperator} onChange={(e) => setApiKeyOperator(e.target.value)} placeholder="0x…" />
              <button type="button" className={styles.secondaryButton} onClick={authorizeOperator}>Authorize this operator on the agent account</button>

              <div className={styles.divider} />

              <div className={styles.rowBetween}><div><strong>Persistent Centry API credential</strong><p>Bind this credential to the selected agent and operator. Revoke it whenever you want.</p></div><button type="button" className={styles.secondaryButton} onClick={generateApiKey}>Generate API key</button></div>
              <label className={styles.label}>Key label</label>
              <input className={styles.input} value={apiKeyLabel} onChange={(e) => setApiKeyLabel(e.target.value)} />
              <div className={styles.scopeGrid}>{scopeOptions.map(([scope,description]) => <label key={scope} className={styles.scope}><input type="checkbox" checked={apiKeyScopes.includes(scope)} onChange={() => setApiKeyScopes((value) => value.includes(scope) ? value.filter((x) => x !== scope) : [...value, scope])}/><span><strong>{scope}</strong><small>{description}</small></span></label>)}</div>
              {newApiKey ? <div className={styles.secretBox}><div>Copy once</div><code>{newApiKey}</code></div> : null}

              <div className={styles.divider} />

              <div className={styles.rowBetween}><div><strong>Activation prompt</strong><p>The prompt tells the external agent to call Centry's activation/skill endpoint for this user-scoped connection.</p></div><button type="button" className={styles.secondaryButton} onClick={generateExternalPrompt}>Generate prompt</button></div>
            </>
          )}
        </Section>
      ) : null}

      {tab === 'analytics' ? (
        <Section title="Agent analytics" description="Onchain activity is read from the agent account's events, so the history is independently verifiable.">
          {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
            <>
              <div className={styles.stats}><div><strong>{activity.length}</strong><span>recent events</span></div><div><strong>{selectedAgent.active ? 'ON' : 'OFF'}</strong><span>agent status</span></div><div><strong>{selectedAgent.account.slice(0, 8)}…</strong><span>agent account</span></div></div>
              <button type="button" className={styles.secondaryButton} onClick={loadActivity}>Refresh activity</button>
              <div className={styles.activityList}>{activity.length ? activity.map((item, index) => <div className={styles.activity} key={`${item.transactionHash}-${index}`}><div><strong>{item.type}</strong><span>Block {item.blockNumber}</span></div><code>{item.transactionHash}</code></div>) : <div className={styles.empty}>No onchain events yet.</div>}</div>
            </>
          )}
        </Section>
      ) : null}

      {tab === 'chat' ? (
        <Section title="Ask this agent" description="Ask the selected agent what it has done. Answers are grounded in its verified onchain activity.">
          {!selectedAgent ? <div className={styles.empty}>Select an agent first.</div> : (
            <>
              <div className={styles.chat}><div className={styles.chatHistory}>{chatMessages.length ? chatMessages.map((message,index) => <div key={index} className={message.role === 'user' ? styles.chatUser : styles.chatAgent}><span>{message.role === 'user' ? 'You' : selectedAgent.name}</span><p>{message.content}</p></div>) : <div className={styles.empty}>Ask: “What have you done today?”</div>}</div></div>
              <div className={styles.chatComposer}><select className={styles.input} value={chatProvider} onChange={(e) => setChatProvider(e.target.value)}>{providerOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><input className={styles.input} value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }} placeholder="What have you done?" /><button type="button" className={styles.primaryButton} onClick={sendChat}>Send</button></div>
            </>
          )}
        </Section>
      ) : null}
    </div>
  );
}

export default function AgentsPage() {
  return <Providers><AppShell><AgentPageContent /></AppShell></Providers>;
}
