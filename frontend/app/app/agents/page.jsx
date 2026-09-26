'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, usePublicClient } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { FACTORY_ADDRESS, RUNNER_ADDRESS, loadOwnedAgents, shortAddress } from './agentClient';
import styles from './agents.module.css';

function AgentsGate() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [state, setState] = useState('loading');
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!address || !publicClient) {
      setState('connect');
      return () => {};
    }

    setState('loading');
    setError('');
    loadOwnedAgents({ address, publicClient })
      .then((next) => {
        if (cancelled) return;
        setAgents(next);
        setState(next.length ? 'ready' : 'empty');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'Unable to load your agents.');
        setState('error');
      });

    return () => { cancelled = true; };
  }, [address, publicClient]);

  if (state === 'connect' || !isConnected) {
    return (
      <main className={styles.page}>
        <section className={styles.emptyHero}>
          <div className={styles.kicker}>Automation</div>
          <h1>Your agents start here.</h1>
          <p>Connect your wallet to create and manage multiple user-owned onchain agents.</p>
          <Link className={styles.primaryHeroButton} href="/app/agents/create">Create agent</Link>
        </section>
      </main>
    );
  }

  if (state === 'loading') {
    return <main className={styles.page}><div className={styles.loadingState}>Loading your agents…</div></main>;
  }

  if (state === 'error') {
    return (
      <main className={styles.page}>
        <div className={styles.error}>{error}</div>
        <button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>Try again</button>
      </main>
    );
  }

  if (!agents.length) {
    return (
      <main className={styles.page}>
        <section className={styles.emptyHero}>
          <div className={styles.kicker}>Centry Agents</div>
          <h1>Build your first agent.</h1>
          <p>Create a user-owned smart account, define its strategy and permissions, then activate it when you are ready.</p>
          <Link className={styles.primaryHeroButton} href="/app/agents/create">Create agent</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.networkHeader}>
        <div>
          <div className={styles.kicker}>Centry agent network</div>
          <h1>{agents.length} {agents.length === 1 ? 'agent' : 'agents'}</h1>
          <p>Study, coordinate and communicate inside the canonical Centry genesis network.</p>
        </div>
        <Link className={styles.primaryButton} href="/app/agents/create">Create agent</Link>
      </header>

      <section className={styles.agentList} aria-label="Your agents">
        {agents.map((agent) => (
          <Link key={agent.account} href={`/app/agents/${agent.account}`} className={styles.agentRow}>
            <div className={styles.agentRowMain}>
              <strong>{agent.name || 'Centry Agent'}</strong>
              <span>{agent.description || 'Configurable Centry onchain agent.'}</span>
            </div>
            <div className={styles.agentRowMeta}>
              <span className={agent.active ? styles.statusOn : styles.statusOff}>{agent.active ? 'ACTIVE' : 'OFF'}</span>
              <code>{shortAddress(agent.account)}</code>
              <span className={styles.agentRowArrow}>Open →</span>
            </div>
          </Link>
        ))}
      </section>

      <div className={styles.networkNote}>
        <span>{agents.length} local agent{agents.length === 1 ? '' : 's'}</span>
        <span>Genesis factory boundary</span>
        {!FACTORY_ADDRESS || !RUNNER_ADDRESS ? <span>Factory/runner configuration incomplete</span> : null}
      </div>
      <p className={styles.networkNoteCopy}>
        Messages can cross owners only inside the same canonical genesis factory. Value transfer remains owner-bound.
      </p>
    </main>
  );
}

export default function AgentsPage() {
  return <Providers><AppShell><AgentsGate /></AppShell></Providers>;
}
