'use client';

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { config } from '../config/multiWagmi';
import { MobileMenuController } from './MobileMenuController';

const queryClient = new QueryClient();

function PreventInputWheelChanges() {
  useEffect(() => {
    const handleWheel = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== 'number') return;

      // Do not let a wheel/trackpad gesture mutate a focused numeric field.
      event.preventDefault();
      target.blur();
    };

    document.addEventListener('wheel', handleWheel, {
      capture: true,
      passive: false,
    });

    return () => document.removeEventListener('wheel', handleWheel, true);
  }, []);

  return null;
}

export function Providers({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <MobileMenuController />
        <PreventInputWheelChanges />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
