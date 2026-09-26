import { isAddress } from 'viem';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';

export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_CENTRY_AGENT_FACTORY || '';
export const RUNNER_ADDRESS = process.env.NEXT_PUBLIC_CENTRY_AGENT_RUNNER_ADDRESS || '';
export const API_BASE = (process.env.NEXT_PUBLIC_CENTRY_AGENT_API_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
export const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_CENTRY_AGENT_PAYWALL === 'true';
export const AGENT_PRICE_RAW = 2500000n;


let ownerSessionOwner = "";
let ownerSessionPromise = null;

export async function ensureOwnerSession({ address, account, signMessageAsync }) {
  const owner = String(address || "").trim();
  const agentAccount = String(account || "").trim();
  if (!owner || !agentAccount || typeof signMessageAsync !== "function") {
    throw new Error("owner_session_wallet_required");
  }

  const ownerKey = owner.toLowerCase();
  if (ownerSessionOwner !== ownerKey) {
    ownerSessionOwner = ownerKey;
    ownerSessionPromise = null;
  }
  if (ownerSessionPromise) return ownerSessionPromise;

  ownerSessionPromise = (async () => {
    try {
      const current = await apiJson(`${API_BASE}/api/v1/agent-admin/session`, {
        method: 'GET',
        credentials: 'include',
      });
      if (String(current?.owner || '').toLowerCase() === ownerKey) return current;
    } catch (error) {
      if (error?.status !== 401) throw error;
    }

    const challenge = await apiJson(`${API_BASE}/api/v1/agent-admin/challenge`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner, account: agentAccount, action: 'agent-session' }),
    });
    const signature = await signMessageAsync({ message: challenge.message });
    return apiJson(`${API_BASE}/api/v1/agent-admin/session`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner, account: agentAccount, challengeToken: challenge.token, signature }),
    });
  })().finally(() => { ownerSessionPromise = null; });

  return ownerSessionPromise;
}

export const FACTORY_ABI = [
  { type: 'function', name: 'getAgentAccounts', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: 'accounts', type: 'address[]' }] },
  { type: 'function', name: 'createAgentAccount', stateMutability: 'nonpayable', inputs: [{ name: 'templateId', type: 'bytes32' }, { name: 'configHash', type: 'bytes32' }, { name: 'metadataURI', type: 'string' }, { name: 'initialOperator', type: 'address' }], outputs: [{ name: 'agentAccount', type: 'address' }] },
  { type: 'function', name: 'purchaseAndCreateAgentAccount', stateMutability: 'nonpayable', inputs: [{ name: 'templateId', type: 'bytes32' }, { name: 'configHash', type: 'bytes32' }, { name: 'metadataURI', type: 'string' }, { name: 'initialOperator', type: 'address' }], outputs: [{ name: 'agentAccount', type: 'address' }] },
];

export const ERC20_ABI = [
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

export const ACCOUNT_ABI = [
  { type: 'function', name: 'active', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'agentOperators', stateMutability: 'view', inputs: [{ name: 'operator', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'setActive', stateMutability: 'nonpayable', inputs: [{ name: 'active', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'setAgentOperator', stateMutability: 'nonpayable', inputs: [{ name: 'operator', type: 'address' }, { name: 'active', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'withdrawNative', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdrawToken', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'transferToAgent', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'setPermission', stateMutability: 'nonpayable', inputs: [{ name: 'operator', type: 'address' }, { name: 'target', type: 'address' }, { name: 'selector', type: 'bytes4' }, { name: 'allowed', type: 'bool' }, { name: 'expiresAt', type: 'uint64' }, { name: 'maxNativeValue', type: 'uint128' }], outputs: [] },
  { type: 'function', name: 'permissions', stateMutability: 'view', inputs: [{ name: 'operator', type: 'address' }, { name: 'target', type: 'address' }, { name: 'selector', type: 'bytes4' }], outputs: [{ name: 'allowed', type: 'bool' }, { name: 'expiresAt', type: 'uint64' }, { name: 'maxNativeValue', type: 'uint128' }] },
];

export const providerOptions = [
  ['gemini', 'Gemini'],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
];

export const AGENT_ACTION_OPTIONS = [
  ['supply', 'Supply', 'Supply assets into Centry lending'],
  ['withdraw', 'Withdraw', 'Withdraw supplied assets'],
  ['borrow', 'Borrow', 'Open or increase borrowing'],
  ['repay', 'Repay', 'Repay existing debt'],
  ['swap', 'Swap', 'Swap CENT and Arc-native USDC'],
  ['castVote', 'Governance', 'Cast governance votes'],
  ['transfer', 'Agent transfer', 'Move supported assets between your own agents'],
];

export const AGENT_ASSET_OPTIONS = [
  ['USDC', 'USDC'],
  ['EURC', 'EURC'],
  ['CIRBTC', 'cirBTC'],
  ['CENT', 'CENT'],
];

export const DEFAULT_SCOPES = ['read', 'lend', 'borrow', 'repay', 'swap'];

export const scopeOptions = [
  ['read', 'Read balances, positions and markets'],
  ['lend', 'Supply and withdraw'],
  ['borrow', 'Borrow assets'],
  ['repay', 'Repay debt'],
  ['swap', 'Swap CENT and Arc-native USDC'],
  ['governance', 'Governance actions'],
  ['agent-to-agent', 'Send tasks/messages to other Centry agents'],
];

export const WITHDRAWABLE_ASSETS = [
  { key: 'native', label: 'USDC (native)', decimals: 18, address: null },
  { key: 'cent', label: 'CENT', decimals: 18, address: CONTRACT_ADDRESSES.centryToken },
  { key: 'eurc', label: 'EURC', decimals: 6, address: CONTRACT_ADDRESSES.EURC },
  { key: 'cirbtc', label: 'cirBTC', decimals: 8, address: CONTRACT_ADDRESSES.CIRBTC },
];

export function defaultAgentConfig() {
  return {
    name: '',
    description: '',
    provider: '',
    model: '',
    providerKey: '',
    autonomy: {
      enabled: true,
      instructions: '',
      maxActions: 4,
      slippageBps: 50,
      riskGuard: {
        enabled: false,
        minHealthFactor: '1.50',
        repayAtHealthFactor: '1.65',
        stopBorrowAtHealthFactor: '1.80',
      },
    },
    policy: {
      allowedActions: AGENT_ACTION_OPTIONS.map(([value]) => value),
      allowedAssets: AGENT_ASSET_OPTIONS.map(([value]) => value),
      maxAmountByAsset: { USDC: '', EURC: '', CIRBTC: '', CENT: '' },
    },
  };
}

export async function apiJson(url, init) {
  const response = await fetch(url, { credentials: 'include', ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function loadOwnedAgents({ address, publicClient }) {
  if (!address || !publicClient || !FACTORY_ADDRESS) return [];
  const rawAccounts = (await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getAgentAccounts',
    args: [address],
  })).map(String);

  const agents = [];
  for (const account of rawAccounts) {
    let agent;
    try {
      agent = await apiJson(`${API_BASE}/api/v1/agents/account/${account}`);
    } catch (error) {
      if (error?.status !== 404) throw error;
      agent = {
        id: account,
        account,
        owner: address,
        registered: false,
        name: '',
        description: 'This smart account has not completed Centry agent registration yet.',
        type: 'unregistered',
        active: false,
        config: null,
      };
    }

    // `active` is onchain state. Do not trust the persisted DB copy after an
    // owner transaction changes the smart account.
    const liveActive = await publicClient.readContract({
      address: account,
      abi: ACCOUNT_ABI,
      functionName: 'active',
    });

    agents.push({
      ...agent,
      active: Boolean(liveActive),
    });
  }
  return agents;
}

export async function loadAgentNetwork(agentId) {
  return apiJson(`${API_BASE}/api/v1/agents/${encodeURIComponent(agentId)}/network`, { method: 'GET' });
}

export async function sendAgentNetworkMessage(agentId, toAgentId, message) {
  return apiJson(`${API_BASE}/api/v1/agents/${encodeURIComponent(agentId)}/network`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ toAgentId, message }),
  });
}

export function shortAddress(value) {
  if (!value || !isAddress(value)) return value || '';
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function normalizeConfigForHash(config) {
  return {
    name: String(config.name || '').trim(),
    description: String(config.description || '').trim(),
    provider: config.provider,
    model: String(config.model || '').trim(),
    autonomy: {
      enabled: config.autonomy?.enabled !== false,
      instructions: String(config.autonomy?.instructions || '').trim(),
      maxActions: Number(config.autonomy?.maxActions || 4),
      slippageBps: Number(config.autonomy?.slippageBps ?? 50),
      riskGuard: {
        enabled: config.autonomy?.riskGuard?.enabled === true,
        minHealthFactor: String(config.autonomy?.riskGuard?.minHealthFactor || '1.50'),
        repayAtHealthFactor: String(config.autonomy?.riskGuard?.repayAtHealthFactor || '1.65'),
        stopBorrowAtHealthFactor: String(config.autonomy?.riskGuard?.stopBorrowAtHealthFactor || '1.80'),
      },
    },
    policy: {
      allowedActions: [...(config.policy?.allowedActions || [])].sort(),
      allowedAssets: [...(config.policy?.allowedAssets || [])].sort(),
      maxAmountByAsset: { ...(config.policy?.maxAmountByAsset || {}) },
    },
  };
}
