'use client';

import React from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from 'wagmi';
import { arcTestnet } from '../config/wagmi';
import { useLendingPool } from '../hooks/useLendingPool';

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { usdcBalance } = useLendingPool();

  const injected =
    connectors.find((connector) => connector.id === 'injected') ||
    connectors[0];

  const isWrongNetwork =
    isConnected &&
    chainId !== arcTestnet.id;

  if (isConnected) {
    return (
      <div className="wallet-area">
        {isWrongNetwork ? (
          <button
            type="button"
            className="network-warning"
            onClick={() => switchChain({ chainId: arcTestnet.id })}
          >
            {isSwitching
              ? 'Switching…'
              : 'Switch to Arc Testnet'}
          </button>
        ) : null}

        <div className="wallet-balance">
          <span>mUSDC balance</span>
          <strong>
            {Number(usdcBalance || 0).toLocaleString(
              undefined,
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )}{' '}
            mUSDC
          </strong>
        </div>

        <button
          type="button"
          className="wallet-address"
          onClick={() => disconnect()}
          title="Disconnect wallet"
        >
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="connect-wallet"
      disabled={!injected || isPending}
      onClick={() =>
        injected &&
        connect({ connector: injected })
      }
    >
      {isPending
        ? 'Connecting…'
        : 'Connect wallet'}
      <span>↗</span>
    </button>
  );
}
