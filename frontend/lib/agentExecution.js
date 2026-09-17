import { encodeFunctionData, parseUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { ERC20_ABI, LENDING_POOL_ABI, VE_CENTRY_ABI } from '../constants/abis';
import { SWAP_MARKETS } from '../constants/markets';

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
  SWAP: 'swap',
  BRIDGE: 'bridge',
  GATEWAY_FUND: 'gateway.fund',
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
  [AGENT_ACTIONS.SWAP]: 'Swap',
  [AGENT_ACTIONS.BRIDGE]: 'Bridge USDC',
  [AGENT_ACTIONS.GATEWAY_FUND]: 'Fund Arc through Gateway',
};

const VALID_TOKEN_ADDRESSES = new Set(
  SWAP_MARKETS.map((market) => String(market.address || '').toLowerCase()).filter(Boolean),
);
const VALID_LENDING_ADDRESSES = new Set(
  SWAP_MARKETS
    .filter((market) => !market.swapOnly)
    .map((market) => String(market.address || '').toLowerCase())
    .filter(Boolean),
);
const BRIDGE_KEYS = new Set(['arc', 'base', 'arbitrum', 'ethereum']);

function positiveAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function positiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function requiredActionError(message) {
  return { ok: false, error: message };
}

export function validateAgentPlan(plan) {
  if (!plan || !Array.isArray(plan.actions)) {
    return { ok: false, error: 'No executable action plan was returned.' };
  }
  if (!plan.actions.length) {
    return { ok: false, error: 'The request does not contain an executable site action.' };
  }
  if (plan.actions.length > 6) {
    return { ok: false, error: 'The requested action plan is too large.' };
  }

  for (const action of plan.actions) {
    if (!ACTION_LABELS[action?.type]) {
      return { ok: false, error: `Unsupported action: ${action?.type || 'unknown'}.` };
    }

    const type = action.type;

    if ([AGENT_ACTIONS.SUPPLY, AGENT_ACTIONS.WITHDRAW, AGENT_ACTIONS.BORROW, AGENT_ACTIONS.REPAY].includes(type)) {
      if (!VALID_LENDING_ADDRESSES.has(String(action.asset || '').toLowerCase())) {
        return { ok: false, error: 'The requested lending asset is not a configured Centry market.' };
      }
      if (!positiveAmount(action.amount)) {
        return requiredActionError(`The ${ACTION_LABELS[type].toLowerCase()} request is missing a valid amount.`);
      }
      if (!positiveInteger(action.decimals) && action.decimals !== 0) {
        return requiredActionError(`The ${ACTION_LABELS[type].toLowerCase()} request is missing token decimals.`);
      }
    }

    if (type === AGENT_ACTIONS.APPROVE_ASSET) {
      if (!VALID_TOKEN_ADDRESSES.has(String(action.asset || '').toLowerCase())) {
        return { ok: false, error: 'The requested token is not a configured Centry asset.' };
      }
      if (!positiveAmount(action.amount)) return requiredActionError('The token approval is missing a valid amount.');
      if (!positiveInteger(action.decimals) && action.decimals !== 0) return requiredActionError('The token approval is missing token decimals.');
    }

    if (type === AGENT_ACTIONS.APPROVE_CENT) {
      if (!positiveAmount(action.amount)) return requiredActionError('The CENT approval is missing a valid amount.');
    }

    if (type === AGENT_ACTIONS.CREATE_LOCK) {
      if (!positiveAmount(action.amount)) return requiredActionError('The veCENT lock is missing a valid CENT amount.');
      if (!Number.isInteger(Number(action.weeks)) || Number(action.weeks) < 1 || Number(action.weeks) > 104) {
        return requiredActionError('The veCENT lock is missing a valid duration from 1 to 104 weeks.');
      }
    }

    if (type === AGENT_ACTIONS.INCREASE_LOCK) {
      if (!positiveInteger(action.tokenId)) return requiredActionError('The veCENT increase is missing a valid token ID.');
      if (!positiveAmount(action.amount)) return requiredActionError('The veCENT increase is missing a valid CENT amount.');
    }

    if (type === AGENT_ACTIONS.EXTEND_LOCK) {
      if (!positiveInteger(action.tokenId)) return requiredActionError('The veCENT extension is missing a valid token ID.');
      if (!Number.isInteger(Number(action.weeks)) || Number(action.weeks) < 1 || Number(action.weeks) > 104) {
        return requiredActionError('The veCENT extension is missing a valid duration from 1 to 104 weeks.');
      }
    }

    if (type === AGENT_ACTIONS.WITHDRAW_LOCK) {
      if (!positiveInteger(action.tokenId)) return requiredActionError('The veCENT withdrawal is missing a valid token ID.');
    }

    if (type === AGENT_ACTIONS.CLAIM_REWARD) {
      if (!positiveInteger(action.tokenId)) return requiredActionError('The reward claim is missing a valid token ID.');
    }

    if (type === AGENT_ACTIONS.SWAP) {
      if (!VALID_TOKEN_ADDRESSES.has(String(action.inputToken || '').toLowerCase()) || !VALID_TOKEN_ADDRESSES.has(String(action.outputToken || '').toLowerCase())) {
        return { ok: false, error: 'The requested swap token is not supported by Centry.' };
      }
      if (!positiveAmount(action.amount) || !String(action.amountRaw || '').match(/^\d+$/)) {
        return requiredActionError('The swap is missing a valid amount.');
      }
      if (!positiveInteger(action.inputDecimals) && action.inputDecimals !== 0) {
        return requiredActionError('The swap is missing input token decimals.');
      }
    }

    if (type === AGENT_ACTIONS.BRIDGE) {
      const from = String(action.fromChain || '').toLowerCase();
      const to = String(action.toChain || '').toLowerCase();
      if (!BRIDGE_KEYS.has(from) || !BRIDGE_KEYS.has(to) || from === to) {
        return { ok: false, error: 'The requested bridge route is incomplete or unsupported.' };
      }
      if (!positiveAmount(action.amount)) return requiredActionError('The bridge is missing a valid USDC amount.');
    }

    if (type === AGENT_ACTIONS.GATEWAY_FUND && !positiveAmount(action.amount)) {
      return { ok: false, error: 'Gateway funding requires a positive amount.' };
    }
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
    return {
      to: CONTRACT_ADDRESSES.lendingPool,
      data: encodeFunctionData({
        abi: LENDING_POOL_ABI,
        functionName: type.split('.')[1],
        args: [action.asset, parseUnits(String(amount), Number(action.decimals ?? 6))],
      }),
      value: 0n,
    };
  }

  if (type === AGENT_ACTIONS.APPROVE_ASSET) {
    return {
      to: action.asset,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESSES.lendingPool, parseUnits(String(amount), Number(action.decimals ?? 6))],
      }),
      value: 0n,
    };
  }

  if (type === AGENT_ACTIONS.APPROVE_CENT) {
    return {
      to: CONTRACT_ADDRESSES.centryToken,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESSES.veCentry, parseUnits(String(amount), 18)],
      }),
      value: 0n,
    };
  }

  if (type === AGENT_ACTIONS.CREATE_LOCK) {
    return {
      to: CONTRACT_ADDRESSES.veCentry,
      data: encodeFunctionData({
        abi: VE_CENTRY_ABI,
        functionName: 'createLock',
        args: [parseUnits(String(amount), 18), BigInt(action.weeks) * 604800n],
      }),
      value: 0n,
    };
  }

  if (type === AGENT_ACTIONS.INCREASE_LOCK) {
    return {
      to: CONTRACT_ADDRESSES.veCentry,
      data: encodeFunctionData({
        abi: VE_CENTRY_ABI,
        functionName: 'increaseAmount',
        args: [BigInt(action.tokenId), parseUnits(String(amount), 18)],
      }),
      value: 0n,
    };
  }

  if (type === AGENT_ACTIONS.EXTEND_LOCK) {
    return {
      to: CONTRACT_ADDRESSES.veCentry,
      data: encodeFunctionData({
        abi: VE_CENTRY_ABI,
        functionName: 'extendLock',
        args: [BigInt(action.tokenId), BigInt(action.weeks) * 604800n],
      }),
      value: 0n,
    };
  }

  if (type === AGENT_ACTIONS.WITHDRAW_LOCK) {
    return {
      to: CONTRACT_ADDRESSES.veCentry,
      data: encodeFunctionData({
        abi: VE_CENTRY_ABI,
        functionName: 'withdraw',
        args: [BigInt(action.tokenId)],
      }),
      value: 0n,
    };
  }

  return null;
}
