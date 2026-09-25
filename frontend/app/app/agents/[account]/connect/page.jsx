'use client';

import { useParams } from 'next/navigation';
import { Providers } from '../../../../../components/Providers';
import { AppShell } from '../../../../../components/AppShell';
import AgentConnectionPanel from '../../../../../components/AgentConnectionPanel';

export default function AgentConnectPage() {
  const { account } = useParams();

  return (
    <Providers>
      <AppShell>
        <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 0 64px' }}>
          <AgentConnectionPanel agentAccount={String(account || '')} />
        </main>
      </AppShell>
    </Providers>
  );
}
