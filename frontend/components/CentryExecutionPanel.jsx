'use client';

import { useMemo, useState } from 'react';
import { useChainId, useConnectorClient } from 'wagmi';
import { describeAgentAction, validateAgentPlan, buildAgentWalletRequest } from '../lib/agentExecution';
import styles from './CentryExecutionPanel.module.css';

const ARC_CHAIN_ID = 5042002;

export default function CentryExecutionPanel({ plan, onDone }) {
  const { data: connectorClient } = useConnectorClient();
  const chainId = useChainId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState([]);

  const validation = useMemo(() => validateAgentPlan(plan), [plan]);
  if (!plan || !validation.ok) return null;

  const execute = async () => {
    if (!connectorClient?.request) {
      setError('Your wallet provider is not available. Reconnect your wallet and try again.');
      return;
    }
    if (chainId !== ARC_CHAIN_ID) {
      setError('Switch your wallet to Arc Testnet before signing the requested action.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      for (const action of plan.actions) {
        const request = buildAgentWalletRequest(action);
        const hash = await connectorClient.request({
          method: 'eth_sendTransaction',
          params: [{
            from: request.from,
            to: request.to,
            data: request.data,
            value: `0x${request.value.toString(16)}`,
          }],
        });
        setCompleted((current) => [...current, { action, hash }]);
      }
      onDone?.();
    } catch (caughtError) {
      setError(caughtError?.shortMessage || caughtError?.message || 'Wallet execution failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-label="Centrion execution plan">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>READY TO EXECUTE</span>
          <h3>{plan.title || 'Centry action'}</h3>
          <p>{plan.reason || 'Centrion prepared this action from your request.'}</p>
        </div>
      </div>
      <div className={styles.actions}>
        {plan.actions.map((action, index) => (
          <div className={styles.action} key={`${action.type}-${index}`}>
            <span>{index + 1}</span>
            <strong>{describeAgentAction(action)}</strong>
          </div>
        ))}
      </div>
      {completed.length > 0 ? (
        <div className={styles.completed}>
          {completed.map((item, index) => <div key={`${item.hash}-${index}`}>Signed and submitted · <code>{item.hash.slice(0, 10)}…</code></div>)}
        </div>
      ) : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      <button type="button" className={styles.execute} disabled={busy || completed.length >= plan.actions.length} onClick={() => void execute()}>
        {busy ? 'Waiting for wallet…' : completed.length >= plan.actions.length ? 'Completed' : `Sign ${plan.actions.length} action${plan.actions.length === 1 ? '' : 's'}`}
      </button>
      <p className={styles.note}>Centrion prepares the action. Your wallet approves every onchain transaction.</p>
    </section>
  );
}
