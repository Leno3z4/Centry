'use client';

import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useChainId, useSwitchChain } from 'wagmi';
import { config, arcTestnet } from '../config/multiWagmi';
import { MobileMenuController } from './MobileMenuController';

const queryClient = new QueryClient();

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
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const attemptedForAddress = useRef('');

  useEffect(() => {
    if (!isConnected || !address) {
      attemptedForAddress.current = '';
      return;
    }

    if (chainId === arcTestnet.id) {
      attemptedForAddress.current = '';
      return;
    }

    if (isPending || attemptedForAddress.current === address) return;
    attemptedForAddress.current = address;
    switchChain({ chainId: arcTestnet.id }).catch(() => {
      // The wallet may reject automatic switching; WalletConnect keeps the manual fallback visible.
    });
  }, [address, isConnected, chainId, isPending, switchChain]);

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
