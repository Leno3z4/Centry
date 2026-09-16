import { SWAP_MARKETS } from '../constants/markets';
import { AGENT_ACTIONS } from './agentExecution';

const ACTIVE_ASSETS = SWAP_MARKETS.filter((market) => market.address && !market.swapOnly);

function numberText(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function findAsset(symbol) {
  const normalized = String(symbol || '').trim().toLowerCase();
  return ACTIVE_ASSETS.find((market) => market.symbol.toLowerCase() === normalized || market.id.toLowerCase() === normalized) || null;
}

export function buildDeterministicExecutionPlan(question) {
  const text = String(question || '').trim();
  const lower = text.toLowerCase();

  const lending = lower.match(/\b(borrow|supply|withdraw|repay)\s+(\d+(?:\.\d+)?)\s*([a-z][a-z0-9]*)\b/i);
  if (lending) {
    const [, verb, rawAmount, symbol] = lending;
    const asset = findAsset(symbol);
    const amount = numberText(rawAmount);
    if (!asset || !amount || Number(amount) <= 0) return null;

    const typeMap = {
      borrow: AGENT_ACTIONS.BORROW,
      supply: AGENT_ACTIONS.SUPPLY,
      withdraw: AGENT_ACTIONS.WITHDRAW,
      repay: AGENT_ACTIONS.REPAY,
    };
    const type = typeMap[verb.toLowerCase()];

    return {
      title: `${verb[0].toUpperCase()}${verb.slice(1)} ${amount} ${asset.symbol}`,
      reason: `Centrion prepared the requested ${verb} action using the configured ${asset.symbol} market.`,
      actions: [{
        type,
        amount,
        asset: asset.address,
        assetSymbol: asset.symbol,
        decimals: asset.decimals,
      }],
    };
  }

  return null;
}
