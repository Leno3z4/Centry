'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { FACTORY_ABI, FACTORY_ADDRESS, RUNNER_ADDRESS, loadOwnedAgents, shortAddress } from './agentClient';
import styles from './agents.module.css';

function AgentsGate() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [state, setState] = useState('loading');
  const [agents, setAgents] = useState([]);

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
    let cancelled = false;

    if (!address || !publicClient) {
      setState(address ? 'loading' : 'connect');
      return () => {
        cancelled = true;
      };
    }
    if (ownedAccounts.isLoading || ownedAccounts.isFetching) {
      setState('loading');
      return () => {
        cancelled = true;
      };
    }
    if (ownedAccounts.error) {
      setState('error');
      return () => {
        cancelled = true;
      };
    }

    const accounts = Array.isArray(ownedAccounts.data) ? ownedAccounts.data : [];
    if (!accounts.length) {
      setAgents([]);
      setState('empty');
      return () => {
        cancelled = true;
      };
    }

    setState('loading');
    loadOwnedAgents({ address, publicClient })
      .then((next) => {
        if (cancelled) return;
        setAgents(next);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, ownedAccounts.data, ownedAccounts.error, ownedAccounts.isFetching, ownedAccounts.isLoading]);

  if (state === 'connect' || !isConnected) {
    return (
      <main className={styles.page}>
        <section className={styles.emptyHero}>
          <div className={styles.kicker}>Automation</div>
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
      <section className={styles.networkHeader}>
        <div>
          <div className={styles.kicker}>Centry agent network</div>
          <h1>{agents.length} agent{agents.length === 1 ? '' : 's'}</h1>
          <p>Each agent has its own smart-account wallet. Keep them separate, compare behavior, and coordinate through the genesis-bound network.</p>
        </div>
        <Link className={styles.primaryHeroButton} href="/app/agents/create">Create agent</Link>
      </section>

      {state === 'empty' ? (
        <section className={styles.emptyState}>
          <h2>Create your first agent.</h2>
          <p>Your first smart-account agent becomes the starting point for your agent network.</p>
          <Link className={styles.primaryButton} href="/app/agents/create">Create agent</Link>
        </section>
      ) : (
        <section className={styles.agentList} aria-label="Your agents">
          {agents.map((agent) => (
            <Link className={styles.agentRow} key={agent.account} href={`/app/agents/${agent.account}`}>
              <div className={styles.agentRowMain}>
                <strong>{agent.name || 'Centry Agent'}</strong>
                <span>{agent.description || 'Configurable onchain agent.'}</span>
              </div>
              <div className={styles.agentRowMeta}>
                <code>{shortAddress(agent.account)}</code>
                <span className={agent.active ? styles.statusOn : styles.statusOff}>{agent.active ? 'ACTIVE' : 'OFF'}</span>
                <span className={styles.agentRowArrow}>Open →</span>
              </div>
            </Link>
          ))}
        </section>
      )}

      {state !== 'empty' ? (
        <p className={styles.networkNote}>
          <span>Wallet-controlled</span>
          <span>Genesis-bound A2A</span>
          <span>Value transfer remains owner-bound</span>
        </p>
      ) : null}

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
