import { isAddress, keccak256, parseUnits, toBytes } from 'viem';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';

export const FACTORY_ADDRESS = '0x9CD127b914F370D64589cF43Bc27e75320a226b4';
export const RUNNER_ADDRESS = process.env.NEXT_PUBLIC_CENTRY_AGENT_RUNNER_ADDRESS || '';
export const API_BASE = (process.env.NEXT_PUBLIC_CENTRY_AGENT_API_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
export const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_CENTRY_AGENT_PAYWALL === 'true';
export const AGENT_PRICE_RAW = 2500000n;

const AGENT_NAME_STORAGE_KEY = 'centry_agent_names_v1';

export function rememberAgentName(account, name) {
  if (typeof window === 'undefined' || !account || !String(name || '').trim()) return;
  try {
    const current = JSON.parse(window.localStorage.getItem(AGENT_NAME_STORAGE_KEY) || '{}');
    current[String(account).toLowerCase()] = String(name).trim().slice(0, 64);
    window.localStorage.setItem(AGENT_NAME_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Name persistence is a UI convenience; failure must not block agent creation.
  }
}

function rememberedAgentName(account) {
  if (typeof window === 'undefined' || !account) return '';
  try {
    const current = JSON.parse(window.localStorage.getItem(AGENT_NAME_STORAGE_KEY) || '{}');
    return String(current?.[String(account).toLowerCase()] || '').trim();
  } catch {
    return '';
  }
}


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

const AUTHORIZATION_PERMISSION_COMPONENTS = [
  { name: 'operator', type: 'address' },
  { name: 'target', type: 'address' },
  { name: 'selector', type: 'bytes4' },
  { name: 'allowed', type: 'bool' },
  { name: 'expiresAt', type: 'uint64' },
  { name: 'maxNativeValue', type: 'uint128' },
];

const AUTHORIZATION_LIMIT_COMPONENTS = [
  { name: 'operator', type: 'address' },
  { name: 'target', type: 'address' },
  { name: 'selector', type: 'bytes4' },
  { name: 'asset', type: 'address' },
  { name: 'maxAmountPerCall', type: 'uint128' },
  { name: 'maxAmountPerWindow', type: 'uint128' },
  { name: 'windowDuration', type: 'uint64' },
];

const AUTHORIZATION_SPENDER_COMPONENTS = [
  { name: 'operator', type: 'address' },
  { name: 'asset', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'allowed', type: 'bool' },
];

export const FACTORY_ABI = [
  { type: 'function', name: 'getAgentAccounts', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: 'accounts', type: 'address[]' }] },
  { type: 'function', name: 'createAgentAccount', stateMutability: 'nonpayable', inputs: [{ name: 'templateId', type: 'bytes32' }, { name: 'configHash', type: 'bytes32' }, { name: 'metadataURI', type: 'string' }, { name: 'initialOperator', type: 'address' }], outputs: [{ name: 'agentAccount', type: 'address' }] },
  { type: 'function', name: 'purchaseAndCreateAgentAccount', stateMutability: 'nonpayable', inputs: [{ name: 'templateId', type: 'bytes32' }, { name: 'configHash', type: 'bytes32' }, { name: 'metadataURI', type: 'string' }, { name: 'initialOperator', type: 'address' }], outputs: [{ name: 'agentAccount', type: 'address' }] },
  { type: 'function', name: 'createAgentAccountWithAuthorization', stateMutability: 'nonpayable', inputs: [
    { name: 'templateId', type: 'bytes32' },
    { name: 'configHash', type: 'bytes32' },
    { name: 'metadataURI', type: 'string' },
    { name: 'initialOperator', type: 'address' },
    { name: 'authorizationPermissions', type: 'tuple[]', components: AUTHORIZATION_PERMISSION_COMPONENTS },
    { name: 'authorizationLimits', type: 'tuple[]', components: AUTHORIZATION_LIMIT_COMPONENTS },
    { name: 'authorizationSpenders', type: 'tuple[]', components: AUTHORIZATION_SPENDER_COMPONENTS },
  ], outputs: [{ name: 'agentAccount', type: 'address' }] },
  { type: 'function', name: 'purchaseAndCreateAgentAccountWithAuthorization', stateMutability: 'nonpayable', inputs: [
    { name: 'templateId', type: 'bytes32' },
    { name: 'configHash', type: 'bytes32' },
    { name: 'metadataURI', type: 'string' },
    { name: 'initialOperator', type: 'address' },
    { name: 'authorizationPermissions', type: 'tuple[]', components: AUTHORIZATION_PERMISSION_COMPONENTS },
    { name: 'authorizationLimits', type: 'tuple[]', components: AUTHORIZATION_LIMIT_COMPONENTS },
    { name: 'authorizationSpenders', type: 'tuple[]', components: AUTHORIZATION_SPENDER_COMPONENTS },
  ], outputs: [{ name: 'agentAccount', type: 'address' }] },
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
  { type: 'function', name: 'financialLimitVersion', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'setFinancialLimit', stateMutability: 'nonpayable', inputs: [{ name: 'operator', type: 'address' }, { name: 'target', type: 'address' }, { name: 'selector', type: 'bytes4' }, { name: 'asset', type: 'address' }, { name: 'maxAmountPerCall', type: 'uint128' }, { name: 'maxAmountPerWindow', type: 'uint128' }, { name: 'windowDuration', type: 'uint64' }], outputs: [] },
  { type: 'function', name: 'setApprovalSpender', stateMutability: 'nonpayable', inputs: [{ name: 'operator', type: 'address' }, { name: 'asset', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'allowed', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'approvalSpenders', stateMutability: 'view', inputs: [{ name: 'operator', type: 'address' }, { name: 'asset', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'configureAuthorization', stateMutability: 'nonpayable', inputs: [
    { name: 'authorizationPermissions', type: 'tuple[]', components: AUTHORIZATION_PERMISSION_COMPONENTS },
    { name: 'authorizationLimits', type: 'tuple[]', components: AUTHORIZATION_LIMIT_COMPONENTS },
    { name: 'authorizationSpenders', type: 'tuple[]', components: AUTHORIZATION_SPENDER_COMPONENTS },
  ], outputs: [] },
  { type: 'function', name: 'financialLimits', stateMutability: 'view', inputs: [{ name: 'operator', type: 'address' }, { name: 'target', type: 'address' }, { name: 'selector', type: 'bytes4' }, { name: 'asset', type: 'address' }], outputs: [{ name: 'maxAmountPerCall', type: 'uint128' }, { name: 'maxAmountPerWindow', type: 'uint128' }, { name: 'spentInWindow', type: 'uint128' }, { name: 'windowStart', type: 'uint64' }, { name: 'windowDuration', type: 'uint64' }] },
];

export const providerOptions = [
  ['gemini', 'Gemini'],
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
];

export const RUNNER_PERMISSION_TTL_SECONDS = 0;
export const RUNNER_FINANCIAL_WINDOW_SECONDS = 24 * 60 * 60;

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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const ACTION_TARGETS = {
  supply: [CONTRACT_ADDRESSES.lendingPool, 'supply(address,uint256)'],
  withdraw: [CONTRACT_ADDRESSES.lendingPool, 'withdraw(address,uint256)'],
  borrow: [CONTRACT_ADDRESSES.lendingPool, 'borrow(address,uint256)'],
  repay: [CONTRACT_ADDRESSES.lendingPool, 'repay(address,uint256)'],
  swap: [CONTRACT_ADDRESSES.unitFlowRouter, 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))'],
  transfer: null,
  castVote: [CONTRACT_ADDRESSES.governor, 'castVote(uint256,uint8)'],
};

const TOKEN_ADDRESSES = {
  USDC: CONTRACT_ADDRESSES.USDC,
  EURC: CONTRACT_ADDRESSES.EURC,
  CIRBTC: CONTRACT_ADDRESSES.CIRBTC,
  CENT: CONTRACT_ADDRESSES.centryToken,
};

const TOKEN_DECIMALS = { USDC: 6, EURC: 6, CIRBTC: 8, CENT: 18 };
const FINANCIAL_ACTIONS = new Set(['supply', 'withdraw', 'borrow', 'repay', 'transfer']);

export function selector(signature) {
  return '0x' + keccak256(toBytes(signature)).slice(2, 10);
}

export function buildRunnerAuthorizationPlan({
  policy = {},
  agentAccount = null,
  nowSeconds = Math.floor(Date.now() / 1000),
} = {}) {
  if (!RUNNER_ADDRESS) throw new Error('Hosted runner address is not configured.');

  const allowedActions = policy.allowedActions || ['supply', 'withdraw', 'borrow', 'repay'];
  const allowedAssets = policy.allowedAssets || ['USDC'];
  const permissions = [];
  const financialLimits = [];
  const approvalSpenders = [];
  const permissionKeys = new Set();
  const limitKeys = new Set();
  const approvalSpenderKeys = new Set();
  const expiresAt = BigInt(nowSeconds + RUNNER_PERMISSION_TTL_SECONDS);
  const maxUint128 = (1n << 128n) - 1n;
  const capFor = (asset) => String(policy.maxAmountByAsset?.[asset] || '').trim();

  const addPermission = (target, signature) => {
    const normalizedTarget = target.toLowerCase();
    const normalizedSelector = selector(signature).toLowerCase();
    const key = normalizedTarget + ':' + normalizedSelector;
    if (permissionKeys.has(key)) return;
    permissionKeys.add(key);
    permissions.push([RUNNER_ADDRESS, target, selector(signature), true, expiresAt, 0n]);
  };

  const addApprovalSpender = (asset, spender) => {
    const key = asset.toLowerCase() + ':' + spender.toLowerCase();
    if (approvalSpenderKeys.has(key)) return;
    approvalSpenderKeys.add(key);
    approvalSpenders.push([RUNNER_ADDRESS, asset, spender, true]);
  };

  const addLimit = (target, signature, asset) => {
    const normalizedAsset = String(asset || '').toLowerCase();
    const normalizedTarget = target.toLowerCase();
    const normalizedSelector = selector(signature).toLowerCase();
    const key = normalizedTarget + ':' + normalizedSelector + ':' + normalizedAsset;
    if (limitKeys.has(key)) return;
    limitKeys.add(key);

    const assetSymbol = Object.entries(TOKEN_ADDRESSES).find(([, value]) =>
      String(value).toLowerCase() === normalizedAsset
    )?.[0];
    const cap = assetSymbol ? capFor(assetSymbol) : '';
    if (!cap) throw new Error('missing_financial_cap_' + (assetSymbol || 'asset'));

    let maxRaw;
    try {
      maxRaw = parseUnits(cap, TOKEN_DECIMALS[assetSymbol] ?? 18);
    } catch {
      throw new Error('invalid_financial_cap_' + assetSymbol);
    }
    if (maxRaw <= 0n) throw new Error('missing_financial_cap_' + assetSymbol);
    if (maxRaw > maxUint128) throw new Error('financial_cap_too_large_' + assetSymbol);

    financialLimits.push([
      RUNNER_ADDRESS,
      target,
      selector(signature),
      asset,
      maxRaw,
      maxRaw,
      BigInt(RUNNER_FINANCIAL_WINDOW_SECONDS),
    ]);
  };

  for (const action of allowedActions) {
    if (ACTION_TARGETS[action]) addPermission(...ACTION_TARGETS[action]);
    if (FINANCIAL_ACTIONS.has(action)) {
      const targetAddress = ACTION_TARGETS[action]?.[0];
      const targetSignature = ACTION_TARGETS[action]?.[1];
      if (targetAddress && targetSignature) {
        for (const asset of allowedAssets) {
          if (TOKEN_ADDRESSES[asset]) addLimit(targetAddress, targetSignature, TOKEN_ADDRESSES[asset]);
        }
      }
    }
  }

  if (allowedActions.includes('supply') || allowedActions.includes('repay')) {
    for (const asset of allowedAssets) {
      if (!TOKEN_ADDRESSES[asset]) continue;
      addPermission(TOKEN_ADDRESSES[asset], 'approve(address,uint256)');
      addLimit(TOKEN_ADDRESSES[asset], 'approve(address,uint256)', TOKEN_ADDRESSES[asset]);
      addApprovalSpender(TOKEN_ADDRESSES[asset], CONTRACT_ADDRESSES.lendingPool);
    }
  }

  if (allowedActions.includes('swap')) {
    const swapSignature = 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))';
    addPermission(CONTRACT_ADDRESSES.unitFlowRouter, swapSignature);
    addLimit(CONTRACT_ADDRESSES.unitFlowRouter, swapSignature, CONTRACT_ADDRESSES.centryToken);
    addLimit(CONTRACT_ADDRESSES.unitFlowRouter, swapSignature, CONTRACT_ADDRESSES.USDC);
    for (const asset of ['CENT', 'USDC']) {
      const token = TOKEN_ADDRESSES[asset];
      if (!token) continue;
      addPermission(token, 'approve(address,uint256)');
      addLimit(token, 'approve(address,uint256)', token);
      addApprovalSpender(token, CONTRACT_ADDRESSES.unitFlowRouter);
    }
  }

  if (allowedActions.includes('transfer')) {
    const transferTarget = agentAccount || ZERO_ADDRESS;
    addPermission(transferTarget, 'transferToAgent(address,address,uint256)');
    for (const asset of allowedAssets) {
      if (TOKEN_ADDRESSES[asset]) addLimit(transferTarget, 'transferToAgent(address,address,uint256)', TOKEN_ADDRESSES[asset]);
    }
  }

  return { permissions, financialLimits, approvalSpenders };
}

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
      allowedActions: ['supply', 'withdraw', 'borrow', 'repay'],
      allowedAssets: ['USDC'],
      maxAmountByAsset: { USDC: '', EURC: '', CIRBTC: '', CENT: '' },
    },
    a2a: {
      receiveEnabled: false,
      allowedAgentIds: [],
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

    const rememberedName = rememberedAgentName(account);
    if (rememberedName && (!String(agent.name || '').trim() || /^centry agent$/i.test(String(agent.name).trim()))) {
      agent = { ...agent, name: rememberedName };
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
    a2a: {
      receiveEnabled: config.a2a?.receiveEnabled === true,
      allowedAgentIds: [...(config.a2a?.allowedAgentIds || [])].map(String).sort(),
    },
  };
}
