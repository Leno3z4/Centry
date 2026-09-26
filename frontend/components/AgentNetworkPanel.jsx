'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import {
  ensureOwnerSession,
  loadAgentNetwork,
  sendAgentNetworkMessage,
  shortAddress,
} from '../app/app/agents/agentClient';
import styles from '../app/app/agents/agents.module.css';

export default function AgentNetworkPanel({ agent }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [peers, setPeers] = useState([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState('loading');
  const [status, setStatus] = useState('');

  async function refresh() {
    if (!agent || !address) return;
    setState('loading');
    try {
      await ensureOwnerSession({ address, account: agent.account, signMessageAsync });
      const result = await loadAgentNetwork(agent.id);
      const next = Array.isArray(result?.peers) ? result.peers : [];
      setPeers(next);
      setSelected((current) =>
        next.some((item) => item.id === current) ? current : (next[0]?.id || '')
      );
      setState('ready');
      setStatus('');
    } catch (error) {
      setState('error');
      setStatus(error?.message || 'Network unavailable.');
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, [agent?.id, address]);

  const target = useMemo(
    () => peers.find((item) => item.id === selected) || null,
    [peers, selected],
  );

  async function send() {
    const text = message.trim();
    if (!target || !text || !agent || !address) return;
    setStatus('Sending…');
    try {
      await ensureOwnerSession({ address, account: agent.account, signMessageAsync });
      const result = await sendAgentNetworkMessage(agent.id, target.id, text);
      setMessage('');
      setStatus(result?.accepted ? 'Queued for ' + target.name + '.' : 'Message not queued.');
    } catch (error) {
      setStatus(error?.message || 'Message failed.');
    }
  }

  return (
    <section className={styles.networkPanel} aria-label="Agent network">
      <div className={styles.networkPanelHead}>
        <div>
          <span className={styles.proofKicker}>Agent network</span>
          <h2>{peers.length ? peers.length + ' peer' + (peers.length === 1 ? '' : 's') : 'No peers yet'}</h2>
          <p>Genesis-bound · study + communicate.</p>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => refresh()}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? '…' : 'Refresh'}
        </button>
      </div>

      {peers.length ? (
        <>
          <div className={styles.networkPeers} aria-label="Available peers">
            {peers.map((peer) => (
              <button
                key={peer.id}
                type="button"
                className={selected === peer.id ? styles.networkPeerActive : styles.networkPeer}
                onClick={() => setSelected(peer.id)}
              >
                <span>
                  <strong>{peer.name}</strong>
                  <small>{shortAddress(peer.account)}</small>
                </span>
                <span>Message</span>
              </button>
            ))}
          </div>

          <div className={styles.networkComposer}>
            <select
              className={styles.input}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              aria-label="Peer"
            >
              {peers.map((peer) => (
                <option key={peer.id} value={peer.id}>
                  {peer.name} · {shortAddress(peer.account)}
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              value={message}
              maxLength={1200}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Send a task or strategy question…"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void send();
                }
              }}
              aria-label="Message"
            />
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void send()}
              disabled={!message.trim() || !target}
            >
              Send
            </button>
          </div>
        </>
      ) : (
        <p className={styles.networkEmpty}>
          Create another agent to start studying and coordinating agents.
        </p>
      )}

      {status ? <p className={styles.networkStatus}>{status}</p> : null}
      {state === 'error' && !status ? <p className={styles.networkStatus}>Network unavailable.</p> : null}
    </section>
  );
}
