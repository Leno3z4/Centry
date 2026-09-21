'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { API_BASE, FACTORY_ABI, FACTORY_ADDRESS, RUNNER_ADDRESS } from './agentClient';
import styles from './agents.module.css';

function AgentsGate() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const [state, setState] = useState('loading');

  const ownedAccounts = useReadContract({
    address: FACTORY_ADDRESS || undefined,
    abi: FACTORY_ABI,
    functionName: 'getAgentAccounts',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && FACTORY_ADDRESS),
      staleTime: 30000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  });

  useEffect(() => {
    if (!address) {
      setState('connect');
      return;
    }
    if (ownedAccounts.isLoading || ownedAccounts.isFetching) {
      setState('loading');
      return;
    }
    if (ownedAccounts.error) {
      setState('error');
      return;
    }

    const accounts = Array.isArray(ownedAccounts.data) ? ownedAccounts.data : [];
    if (accounts.length) {
      router.replace(`/app/agents/${accounts[0]}`);
    } else {
      setState('empty');
    }
  }, [address, ownedAccounts.data, ownedAccounts.error, ownedAccounts.isFetching, ownedAccounts.isLoading, router]);

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
        <div className={styles.error}>{ownedAccounts.error?.message || 'Unable to load your agents.'}</div>
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

      {!FACTORY_ADDRESS || !RUNNER_ADDRESS ? (
        <div className={styles.warning}>
          {[
            !FACTORY_ADDRESS ? 'agent factory' : null,
            !RUNNER_ADDRESS ? 'hosted runner' : null,
          ].filter(Boolean).join(' and ')} must be configured before an agent can be created.
        </div>
      ) : null}
    </main>
  );
}

export default function AgentsPage() {
  return <Providers><AppShell><AgentsGate /></AppShell></Providers>;
}
