'use client';

import React, { useState } from 'react';
import { Providers } from '../frontend/components/Providers';
import { WalletConnect } from '../frontend/components/WalletConnect';
import { VaultCard } from '../frontend/components/VaultCard';
import { LendingCard } from '../frontend/components/LendingCard';
import { GovernanceCard } from '../frontend/components/GovernanceCard';

function MainDashboard() {
  const [activeTab, setActiveTab] = useState('vault');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ borderBottom: '1px solid #334155', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #a855f7)' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Centry</h1>
        </div>
        <WalletConnect />
      </header>

      <main style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#1e293b', padding: '6px', borderRadius: '10px' }}>
          {[
            ['vault', 'Self-Repaying Vault'],
            ['lending', 'Lending Pool'],
            ['governance', 'veGovernance'],
          ].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: activeTab === tab ? '#2563eb' : 'transparent', color: activeTab === tab ? '#fff' : '#94a3b8' }}>
              {label}
            </button>
          ))}
        </div>
        {activeTab === 'vault' && <VaultCard />}
        {activeTab === 'lending' && <LendingCard />}
        {activeTab === 'governance' && <GovernanceCard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Providers>
      <MainDashboard />
    </Providers>
  );
}
