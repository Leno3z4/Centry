'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useChainId } from 'wagmi';
import { config, arcMainnet } from '../config/multiWagmi';
import { MobileMenuController } from './MobileMenuController';

const ProvidersContext = createContext(false);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
const ARC_CHAIN_HEX = `0x${arcMainnet.id.toString(16)}`;
const ARC_ADD_CHAIN_PARAMS = {
  chainId: ARC_CHAIN_HEX,
  chainName: 'Arc Mainnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.arc.io'],
  blockExplorerUrls: ['https://explorer.arc.io'],
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
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const attemptedForAddress = useRef('');

  useEffect(() => {
    // Bridge supports source chains other than Arc, so it owns network switching there.
    if (pathname?.startsWith('/app/bridge')) {
      attemptedForAddress.current = '';
      return;
    }

    if (!isConnected || !address || !connector?.getProvider) {
      attemptedForAddress.current = '';
      return;
    }

    if (chainId === arcMainnet.id) {
      attemptedForAddress.current = '';
      return;
    }

    if (attemptedForAddress.current === address) return;
    attemptedForAddress.current = address;

    let cancelled = false;
    (async () => {
      try {
        const provider = await connector.getProvider();
        if (!cancelled) await addAndSwitchSelectedArc(provider);
      } catch {
        // Some wallets require the user to approve adding/switching networks manually.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, connector, isConnected, chainId, pathname]);

  return null;
}

export function Providers({ children }) {
  const nested = useContext(ProvidersContext);
  if (nested) return children;

  return (
    <ProvidersContext.Provider value={true}>
      <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <AutoSwitchToArc />
        <MobileMenuController />
        <PreventInputWheelChanges />
        {children}
      </QueryClientProvider>
      </WagmiProvider>
    </ProvidersContext.Provider>
  );
}
