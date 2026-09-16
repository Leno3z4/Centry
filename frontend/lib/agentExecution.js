import { encodeFunctionData, parseUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { ERC20_ABI, LENDING_POOL_ABI, VE_CENTRY_ABI } from '../constants/abis';

export const AGENT_ACTIONS = Object.freeze({
  SUPPLY: 'lending.supply',
  WITHDRAW: 'lending.withdraw',
  BORROW: 'lending.borrow',
  REPAY: 'lending.repay',
  APPROVE_ASSET: 'token.approve',
  APPROVE_CENT: 'token.approveCent',
  CREATE_LOCK: 'governance.createLock',
  INCREASE_LOCK: 'governance.increaseLock',
  EXTEND_LOCK: 'governance.extendLock',
  WITHDRAW_LOCK: 'governance.withdrawLock',
  CLAIM_REWARD: 'rewards.claim',
});

const ACTION_LABELS = {
  [AGENT_ACTIONS.SUPPLY]: 'Supply',
  [AGENT_ACTIONS.WITHDRAW]: 'Withdraw',
  [AGENT_ACTIONS.BORROW]: 'Borrow',
  [AGENT_ACTIONS.REPAY]: 'Repay',
  [AGENT_ACTIONS.APPROVE_ASSET]: 'Approve token',
  [AGENT_ACTIONS.APPROVE_CENT]: 'Approve CENT',
  [AGENT_ACTIONS.CREATE_LOCK]: 'Create veCENT lock',
  [AGENT_ACTIONS.INCREASE_LOCK]: 'Increase veCENT lock',
  [AGENT_ACTIONS.EXTEND_LOCK]: 'Extend veCENT lock',
  [AGENT_ACTIONS.WITHDRAW_LOCK]: 'Withdraw veCENT lock',
  [AGENT_ACTIONS.CLAIM_REWARD]: 'Claim reward',
};

export function validateAgentPlan(plan) {
  if (!plan || !Array.isArray(plan.actions)) return { ok: false, error: 'No executable action plan was returned.' };
  if (plan.actions.length === 0) return { ok: false, error: 'The request does not contain an executable site action.' };
  if (plan.actions.length > 6) return { ok: false, error: 'The requested action plan is too large.' };

  for (const action of plan.actions) {
    if (!ACTION_LABELS[action?.type]) return { ok: false, error: `Unsupported action: ${action?.type || 'unknown'}.` };
    if (!action?.asset && action?.type.startsWith('lending.')) return { ok: false, error: 'A lending asset is required.' };
  }
  return { ok: true };
}

export function describeAgentAction(action) {
  const label = ACTION_LABELS[action?.type] || 'Transaction';
  const details = [];
  if (action?.amount) details.push(`${action.amount}${action.assetSymbol ? ` ${action.assetSymbol}` : ''}`);
  if (action?.weeks) details.push(`${action.weeks} weeks`);
  if (action?.tokenId != null) details.push(`veCENT #${action.tokenId}`);
  return `${label}${details.length ? ` · ${details.join(' · ')}` : ''}`;
}

export function buildAgentWalletRequest(action) {
  const type = action?.type;
  const asset = action?.asset;
  const amount = action?.amount;

  if (type === AGENT_ACTIONS.SUPPLY || type === AGENT_ACTIONS.WITHDRAW || type === AGENT_ACTIONS.BORROW || type === AGENT_ACTIONS.REPAY) {
    if (!asset || !amount) throw new Error(`${ACTION_LABELS[type]} requires an asset and amount.`);
    const amountRaw = parseUnits(String(amount), Number(action.decimals ?? 6));
    const functionName = type.split('.')[1];
    return { to: CONTRACT_ADDRESSES.lendingPool, data: encodeFunctionData({ abi: LENDING_POOL_ABI, functionName, args: [asset, amountRaw] }), value: 0n };
  }

  if (type === AGENT_ACTIONS.APPROVE_ASSET) {
    if (!asset || !amount) throw new Error('Token approval requires an asset and amount.');
    return { to: asset, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CONTRACT_ADDRESSES.lendingPool, parseUnits(String(amount), Number(action.decimals ?? 6))] }), value: 0n };
  }

  if (type === AGENT_ACTIONS.APPROVE_CENT) {
    if (!amount) throw new Error('CENT approval requires an amount.');
    return { to: CONTRACT_ADDRESSES.centryToken, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CONTRACT_ADDRESSES.veCentry, parseUnits(String(amount), 18)] }), value: 0n };
  }

  if (type === AGENT_ACTIONS.CREATE_LOCK) {
    if (!amount || !action.weeks) throw new Error('Creating a lock requires CENT amount and duration.');
    return { to: CONTRACT_ADDRESSES.veCentry, data: encodeFunctionData({ abi: VE_CENTRY_ABI, functionName: 'createLock', args: [parseUnits(String(amount), 18), BigInt(action.weeks) * 7n * 24n * 60n * 60n] }), value: 0n };
  }

  if (type === AGENT_ACTIONS.INCREASE_LOCK) {
    if (action.tokenId == null || !amount) throw new Error('Increasing a lock requires tokenId and amount.');
    return { to: CONTRACT_ADDRESSES.veCentry, data: encodeFunctionData({ abi: VE_CENTRY_ABI, functionName: 'increaseAmount', args: [BigInt(action.tokenId), parseUnits(String(amount), 18)] }), value: 0n };
  }

  if (type === AGENT_ACTIONS.EXTEND_LOCK) {
    if (action.tokenId == null || !action.weeks) throw new Error('Extending a lock requires tokenId and duration.');
    return { to: CONTRACT_ADDRESSES.veCentry, data: encodeFunctionData({ abi: VE_CENTRY_ABI, functionName: 'extendLock', args: [BigInt(action.tokenId), BigInt(action.weeks) * 7n * 24n * 60n * 60n] }), value: 0n };
  }

  if (type === AGENT_ACTIONS.WITHDRAW_LOCK) {
    if (action.tokenId == null) throw new Error('Withdrawing a lock requires tokenId.');
    return { to: CONTRACT_ADDRESSES.veCentry, data: encodeFunctionData({ abi: VE_CENTRY_ABI, functionName: 'withdraw', args: [BigInt(action.tokenId)] }), value: 0n };
  }

  throw new Error(`Action ${type} requires a site-specific execution adapter.`);
}
