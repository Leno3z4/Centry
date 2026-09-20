'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount, usePublicClient } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { API_BASE, FACTORY_ADDRESS, RUNNER_ADDRESS, loadOwnedAgents } from './agentClient';
import styles from './agents.module.css';

function AgentsGate() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const router = useRouter();
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!address || !publicClient) {
      setState('connect');
      return;
    }

    loadOwnedAgents({ address, publicClient })
      .then((agents) => {
        if (cancelled) return;
        if (agents.length) {
          router.replace(`/app/agents/${agents[0].account}`);
        } else {
          setState('empty');
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setState('error');
        }
      });

    return () => { cancelled = true; };
  }, [address, publicClient, router]);

  if (state === 'connect' || !isConnected) {
    return (
      <main className={styles.page}>
        <section className={styles.emptyHero}>
          <div className={styles.kicker}>Centry Agents</div>
          <h1>Your agents start here.</h1>
          <p>Connect your wallet to create and manage an onchain agent with its own smart-account wallet.</p>
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
        <div className={styles.error}>{error || 'Unable to load your agents.'}</div>
        <Link className={styles.secondaryButton} href="/app/agents">Try again</Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.createHero}>
        <div className={styles.kicker}>Centry Agents</div>
        <h1>Build an agent that works for you.</h1>
        <p>Give it its own smart-account wallet, choose the AI that powers it, and define exactly what it is allowed to do.</p>
        <Link className={styles.primaryHeroButton} href="/app/agents/create">Create agent</Link>
        <div className={styles.heroFoot}>
          <span>Non-custodial</span>
          <span>Runs on Arc</span>
          <span>Starts OFF</span>
        </div>
      </section>

      {!FACTORY_ADDRESS || !RUNNER_ADDRESS || !API_BASE ? (
        <div className={styles.warning}>The agent factory, hosted runner, and API must be configured before an agent can be created.</div>
      ) : null}
    </main>
  );
}

export default function AgentsPage() {
  return <Providers><AppShell><AgentsGate /></AppShell></Providers>;
}
