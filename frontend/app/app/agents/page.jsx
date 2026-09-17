'use client';

import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import AgentConnectionPanel from '../../../components/AgentConnectionPanel';

export default function AgentsPage() {
  return (
    <Providers>
      <AppShell>
        <AgentConnectionPanel />
      </AppShell>
    </Providers>
  );
}
