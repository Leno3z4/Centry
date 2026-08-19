import React from 'react';
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { arcTestnet } from '../config/wagmi';

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, pendingConnector } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== arcTestnet.id;

  if (isConnected) {
    return (
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        {isWrongNetwork ? (
          <button 
            onClick={() => switchChain?.({ chainId: arcTestnet.id })}
            style={{ backgroundColor: '#ef4444', color: '#fff', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
          >
            Switch to Arc Testnet
          </button>
        ) : (
          <span style={{ fontSize: '14px', color: '#10b981', fontWeight: 'bold' }}>
            ● Arc Testnet
          </span>
        )}
        <span style={{ fontSize: '14px', fontFamily: 'monospace', background: '#1e293b', padding: '6px 12px', borderRadius: '6px', color: '#f8fafc' }}>
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </span>
        <button 
          onClick={() => disconnect()}
          style={{ backgroundColor: '#334155', color: '#fff', padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          onClick={() => connect({ connector })}
          style={{ backgroundColor: '#2563eb', color: '#fff', padding: '10px 18px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
        >
          {connector.name}
        </button>
      ))}
    </div>
  );
}
