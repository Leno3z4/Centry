import { encodeFunctionData, parseUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { ERC20_ABI, LENDING_POOL_ABI, VE_CENTRY_ABI } from '../constants/abis';

export const AGENT_ACTIONS = Object.freeze({
  SUPPLY: 'lending.supply', WITHDRAW: 'lending.withdraw', BORROW: 'lending.borrow', REPAY: 'lending.repay',
  APPROVE_ASSET: 'token.approve', APPROVE_CENT: 'token.approveCent',
  CREATE_LOCK: 'governance.createLock', INCREASE_LOCK: 'governance.increaseLock', EXTEND_LOCK: 'governance.extendLock', WITHDRAW_LOCK: 'governance.withdrawLock',
  CLAIM_REWARD: 'rewards.claim', SWAP: 'swap', BRIDGE: 'bridge', GATEWAY_FUND: 'gateway.fund',
});

const ACTION_LABELS = {
  [AGENT_ACTIONS.SUPPLY]: 'Supply', [AGENT_ACTIONS.WITHDRAW]: 'Withdraw', [AGENT_ACTIONS.BORROW]: 'Borrow', [AGENT_ACTIONS.REPAY]: 'Repay',
  [AGENT_ACTIONS.APPROVE_ASSET]: 'Approve token', [AGENT_ACTIONS.APPROVE_CENT]: 'Approve CENT',
  [AGENT_ACTIONS.CREATE_LOCK]: 'Create veCENT lock', [AGENT_ACTIONS.INCREASE_LOCK]: 'Increase veCENT lock', [AGENT_ACTIONS.EXTEND_LOCK]: 'Extend veCENT lock', [AGENT_ACTIONS.WITHDRAW_LOCK]: 'Withdraw veCENT lock',
  [AGENT_ACTIONS.CLAIM_REWARD]: 'Claim reward', [AGENT_ACTIONS.SWAP]: 'Swap', [AGENT_ACTIONS.BRIDGE]: 'Bridge USDC', [AGENT_ACTIONS.GATEWAY_FUND]: 'Fund Arc through Gateway',
};

export function validateAgentPlan(plan) {
  if (!plan || !Array.isArray(plan.actions)) return { ok: false, error: 'No executable action plan was returned.' };
  if (plan.actions.length === 0) return { ok: false, error: 'The request does not contain an executable site action.' };
  if (plan.actions.length > 6) return { ok: false, error: 'The requested action plan is too large.' };
  for (const action of plan.actions) {
    if (!ACTION_LABELS[action?.type]) return { ok: false, error: `Unsupported action: ${action?.type || 'unknown'}.` };
    if (action?.type.startsWith('lending.') && !action?.asset) return { ok: false, error: 'A lending asset is required.' };
    if (action?.type === AGENT_ACTIONS.SWAP && (!action.inputToken || !action.outputToken || !action.amount)) return { ok: false, error: 'A swap requires input token, output token, and amount.' };
    if (action?.type === AGENT_ACTIONS.BRIDGE && (!action.fromChain || !action.toChain || !action.amount)) return { ok: false, error: 'A bridge requires source chain, destination chain, and amount.' };
  }
  return { ok: true };
}

export function describeAgentAction(action) {
  const label = ACTION_LABELS[action?.type] || 'Transaction';
  const details = [];
  if (action?.amount) details.push(`${action.amount}${action.assetSymbol ? ` ${action.assetSymbol}` : ''}`);
  if (action?.inputSymbol && action?.outputSymbol) details.push(`${action.inputSymbol} → ${action.outputSymbol}`);
  if (action?.fromChain && action?.toChain) details.push(`${action.fromChain} → ${action.toChain}`);
  if (action?.weeks) details.push(`${action.weeks} weeks`);
  if (action?.tokenId != null) details.push(`veCENT #${action.tokenId}`);
  return `${label}${details.length ? ` · ${details.join(' · ')}` : ''}`;
}

export function buildAgentWalletRequest(action) {
  const type = action?.type;
  const amount = action?.amount;
  if ([AGENT_ACTIONS.SUPPLY, AGENT_ACTIONS.WITHDRAW, AGENT_ACTIONS.BORROW, AGENT_ACTIONS.REPAY].includes(type)) {
    const amountRaw = parseUnits(String(amount), Number(action.decimals ?? 6));
    return { to: CONTRACT_ADDRESSES.lendingPool, data: encodeFunctionData({ abi: LENDING_POOL_ABI, functionName: type.split('.')[1], args: [action.asset, amountRaw] }), value: 0n };
  }
  if (type === AGENT_ACTIONS.APPROVE_ASSET) return { to: action.asset, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CONTRACT_ADDRESSES.lendingPool, parseUnits(String(amount), Number(action.decimals ?? 6))] }), value: 0n };
  if (type === AGENT_ACTIONS.APPROVE_CENT) return { to: CONTRACT_ADDRESSES.centryToken, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CONTRACT_ADDRESSES.veCentry, parseUnits(String(amount), 18)] }), value: 0n };
  if (type === AGENT_ACTIONS.CREATE_LOCK) return { to: CONTRACT_ADDRESSES.veCentry, data: encodeFunctionData({ abi: VE_CENTRY_ABI, functionName: 'createLock', args: [parseUnits(String(amount), 18), BigInt(action.weeks) * 7n * 24n * 60n * 60n] }), value: 0n };
  if (type === AGENT_ACTIONS.INCREASE_LOCK) return { to: CONTRACT_ADDRESSES.veCentry, data: encodeFunctionData({ abi: VE_CENTRY_ABI, functionName: 'increaseAmount', args: [BigInt(action.tokenId), parseUnits(String(amount), 18)] }), value: 0n };
  if (type === AGENT_ACTIONS.EXTEND_LOCK) return { to: CONTRACT_ADDRESSES.veCentry, data: encodeFunctionData({ abi: VE_CENTRY_ABI, functionName: 'extendLock', args: [BigInt(action.tokenId), BigInt(action.weeks) * 7n * 24n * 60n * 60n] }), value: 0n };
  if (type === AGENT_ACTIONS.WITHDRAW_LOCK) return { to: CONTRACT_ADDRESSES.veCentry, data: encodeFunctionData({ abi: VE_CENTRY_ABI, functionName: 'withdraw', args: [BigInt(action.tokenId)] }), value: 0n };
  return null;
}
