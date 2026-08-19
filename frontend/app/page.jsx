import React, { useState } from 'react';
import { Providers } from './components/Providers';
import { WalletConnect } from './components/WalletConnect';
import { VaultCard } from './components/VaultCard';
import { LendingCard } from './components/LendingCard';
import { GovernanceCard } from './components/GovernanceCard';

function MainDashboard() {
  const [activeTab, setActiveTab] = useState('vault');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #334155', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #a855f7)' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Arc Yield Protocol</h1>
        </div>
        <WalletConnect />
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: '#1e293b', padding: '6px', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveTab('vault')}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 'bold',
              cursor: 'pointer',
              backgroundColor: activeTab === 'vault' ? '#2563eb' : 'transparent',
              color: activeTab === 'vault' ? '#fff' : '#94a3b8',
              transition: 'all 0.2s',
            }}
          >
            Self-Repaying Vault
          </button>
          <button
            onClick={() => setActiveTab('lending')}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 'bold',
              cursor: 'pointer',
              backgroundColor: activeTab === 'lending' ? '#2563eb' : 'transparent',
              color: activeTab === 'lending' ? '#fff' : '#94a3b8',
              transition: 'all 0.2s',
            }}
          >
            Lending Pool
          </button>
          <button
            onClick={() => setActiveTab('governance')}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 'bold',
              cursor: 'pointer',
              backgroundColor: activeTab === 'governance' ? '#2563eb' : 'transparent',
              color: activeTab === 'governance' ? '#fff' : '#94a3b8',
              transition: 'all 0.2s',
            }}
          >
            veGovernance
          </button>
        </div>

        {/* Tab Content */}
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
