'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useChainId, useConnectorClient } from 'wagmi';
import { config, arcTestnet } from '../config/multiWagmi';
import { MobileMenuController } from './MobileMenuController';

const queryClient = new QueryClient();
const ARC_CHAIN_HEX = `0x${arcTestnet.id.toString(16)}`;
const ARC_ADD_CHAIN_PARAMS = {
  chainId: ARC_CHAIN_HEX,
  chainName: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: ['https://rpc.testnet.arc.network'],
  blockExplorerUrls: ['https://testnet.arcscan.app'],
};

async function addAndSwitchSelectedArc(provider) {
  if (!provider?.request) throw new Error('Wallet does not expose a switchable provider.');

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_HEX }],
    });
  } catch (error) {
    const code = Number(error?.code);
    if (code !== 4902 && code !== -32603 && code !== -32602) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [ARC_ADD_CHAIN_PARAMS],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_HEX }],
    });
  }
}

function PreventInputWheelChanges() {
  useEffect(() => {
    const handleWheel = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== 'number') return;
      event.preventDefault();
      target.blur();
    };

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleWheel, true);
  }, []);
  return null;
}

function AutoSwitchToArc() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: connectorClient } = useConnectorClient();
  const attemptedForAddress = useRef('');

  useEffect(() => {
    // Bridge supports source chains other than Arc, so it owns network switching there.
    if (pathname?.startsWith('/app/bridge')) {
      attemptedForAddress.current = '';
      return;
    }

    if (!isConnected || !address || !connectorClient?.request) {
      attemptedForAddress.current = '';
      return;
    }

    if (chainId === arcTestnet.id) {
      attemptedForAddress.current = '';
      return;
    }

    if (attemptedForAddress.current === address) return;
    attemptedForAddress.current = address;

    addAndSwitchSelectedArc(connectorClient).catch(() => {
      // Some wallets require the user to approve adding/switching networks manually.
    });
  }, [address, isConnected, chainId, connectorClient, pathname]);

  return null;
}

export function Providers({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AutoSwitchToArc />
        <MobileMenuController />
        <PreventInputWheelChanges />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
