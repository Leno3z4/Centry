import { AGENT_ACTIONS } from './agentExecution';
import { evaluateCentrionActionRisk } from './centrionRisk';

const ACTION_TITLES = {
  [AGENT_ACTIONS.SUPPLY]: 'Supply',
  [AGENT_ACTIONS.WITHDRAW]: 'Withdraw',
  [AGENT_ACTIONS.BORROW]: 'Borrow',
  [AGENT_ACTIONS.REPAY]: 'Repay',
  [AGENT_ACTIONS.CREATE_LOCK]: 'Create veCENT lock',
  [AGENT_ACTIONS.INCREASE_LOCK]: 'Increase veCENT lock',
  [AGENT_ACTIONS.EXTEND_LOCK]: 'Extend veCENT lock',
  [AGENT_ACTIONS.WITHDRAW_LOCK]: 'Withdraw veCENT lock',
  [AGENT_ACTIONS.CLAIM_REWARD]: 'Claim reward',
  [AGENT_ACTIONS.SWAP]: 'Swap',
  [AGENT_ACTIONS.BRIDGE]: 'Bridge USDC',
  [AGENT_ACTIONS.GATEWAY_FUND]: 'Fund through Gateway',
};

function actionText(action) {
  const title = ACTION_TITLES[action?.type] || 'Transaction';
  const details = [];
  if (action?.amount) details.push(`${action.amount}${action.assetSymbol ? ` ${action.assetSymbol}` : ''}`);
  if (action?.inputSymbol && action?.outputSymbol) details.push(`${action.inputSymbol} → ${action.outputSymbol}`);
  if (action?.fromChain && action?.toChain) details.push(`${action.fromChain} → ${action.toChain}`);
  if (action?.weeks) details.push(`${action.weeks} weeks`);
  if (action?.tokenId != null) details.push(`veCENT #${action.tokenId}`);
  return `${title}${details.length ? ` · ${details.join(' · ')}` : ''}`;
}

function expectedApproval(action) {
  if (action?.type === AGENT_ACTIONS.SUPPLY || action?.type === AGENT_ACTIONS.REPAY) return `Approve ${action.assetSymbol || 'token'} if allowance is insufficient`;
  if (action?.type === AGENT_ACTIONS.CREATE_LOCK || action?.type === AGENT_ACTIONS.INCREASE_LOCK) return 'Approve CENT if allowance is insufficient';
  if (action?.type === AGENT_ACTIONS.SWAP) return `Approve ${action.inputSymbol || 'input token'} if allowance is insufficient`;
  if (action?.type === AGENT_ACTIONS.BRIDGE) return 'Approve USDC if allowance is insufficient';
  return null;
}

export function buildCentrionPreview(plan, context) {
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  const steps = [];
  const warnings = [];

  for (const action of actions) {
    const approval = expectedApproval(action);
    if (approval) steps.push({ kind: 'approval', text: approval, action });
    steps.push({ kind: 'action', text: actionText(action), action });

    const risk = evaluateCentrionActionRisk(action, context);
    if (risk.warning) warnings.push(risk.warning);
    if (risk.projectedHealthFactor != null) {
      steps.push({
        kind: 'metric',
        text: `Projected health factor · ${risk.projectedHealthFactor.toFixed(2)}`,
        action,
      });
    }
  }

  return { steps, warnings };
}
