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
      if (target instanceof HTMLInputElement && target.type === 'number') {
        target.blur();
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: true });
    return () => document.removeEventListener('wheel', handleWheel);
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
