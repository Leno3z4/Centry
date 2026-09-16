'use client';

import { useMemo, useState } from 'react';
import { useAccount, useChainId, useConnectorClient } from 'wagmi';
import { describeAgentAction, validateAgentPlan, buildAgentWalletRequest, AGENT_ACTIONS } from '../lib/agentExecution';
import { useGatewayFunding } from '../hooks/useGatewayFunding';
import styles from './CentryExecutionPanel.module.css';

const ARC_CHAIN_ID = 5042002;

export default function CentryExecutionPanel({ plan, onDone }) {
  const { address } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const chainId = useChainId();
  const gateway = useGatewayFunding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState([]);
  const validation = useMemo(() => validateAgentPlan(plan), [plan]);
  if (!plan || !validation.ok) return null;

  const sign = async (request) => connectorClient.request({ method: 'eth_sendTransaction', params: [{ from: address, to: request.to, data: request.data, value: `0x${request.value.toString(16)}` }] });

  const execute = async () => {
    if (!address || !connectorClient?.request) return setError('Your wallet provider is not available. Reconnect your wallet and try again.');
    if (chainId !== ARC_CHAIN_ID) return setError('Switch your wallet to Arc Testnet before signing the requested action.');
    setBusy(true); setError('');
    try {
      for (const action of plan.actions) {
        if (action.type === AGENT_ACTIONS.GATEWAY_FUND) {
          const result = await gateway.ensureArcUsdc(action.amount);
          setCompleted((current) => [...current, { action, hash: result.mintHash || 'gateway-complete' }]);
          continue;
        }
        if ([AGENT_ACTIONS.SWAP, AGENT_ACTIONS.BRIDGE, AGENT_ACTIONS.CLAIM_REWARD].includes(action.type)) {
          throw new Error(`${describeAgentAction(action)} is prepared by a site-specific transaction flow and is not yet available through the generic signer.`);
        }
        const request = buildAgentWalletRequest(action);
        if (!request) throw new Error(`Unable to prepare ${describeAgentAction(action)}.`);
        const hash = await sign(request);
        setCompleted((current) => [...current, { action, hash }]);
      }
      onDone?.();
    } catch (caughtError) {
      setError(caughtError?.shortMessage || caughtError?.message || 'Wallet execution failed.');
    } finally { setBusy(false); }
  };

  return (
    <section className={styles.card} aria-label="Centrion execution plan">
      <div className={styles.header}><div><span className={styles.eyebrow}>READY TO EXECUTE</span><h3>{plan.title || 'Centry action'}</h3><p>{plan.reason || 'Centrion prepared this action from your request.'}</p></div></div>
      <div className={styles.actions}>{plan.actions.map((action, index) => <div className={styles.action} key={`${action.type}-${index}`}><span>{index + 1}</span><strong>{describeAgentAction(action)}</strong></div>)}</div>
      {completed.length ? <div className={styles.completed}>{completed.map((item, index) => <div key={`${item.hash}-${index}`}>Signed and submitted · <code>{String(item.hash).slice(0, 10)}…</code></div>)}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      <button type="button" className={styles.execute} disabled={busy || completed.length >= plan.actions.length} onClick={() => void execute()}>{busy ? 'Waiting for wallet…' : completed.length >= plan.actions.length ? 'Completed' : `Sign ${plan.actions.length} action${plan.actions.length === 1 ? '' : 's'}`}</button>
      <p className={styles.note}>Centrion prepares the action. Your wallet approves every onchain transaction.</p>
    </section>
  );
}
