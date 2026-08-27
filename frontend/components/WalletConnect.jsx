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

function shortenAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletConnect() {
  const { address, isConnected, isConnecting } = useAccount();
  const {
    connect,
    connectors,
    isPending: isConnectPending,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const {
    switchChain,
    isPending: isSwitching,
    error: switchError,
  } = useSwitchChain();
  const { usdcBalance } = useLendingPool();

  const injected = connectors.find(
    (connector) => connector.id === 'injected',
  );

  const isWrongNetwork =
    isConnected &&
    chainId !== arcTestnet.id;

  const handleConnect = async () => {
    if (!injected || isConnectPending || isConnecting) return;

    try {
      await connect({ connector: injected });
    } catch {
      // wagmi exposes the connection error through connectError.
    }
  };

  const handleSwitchNetwork = async () => {
    if (isSwitching) return;

    try {
      await switchChain({ chainId: arcTestnet.id });
    } catch {
      // wagmi exposes the switch error through switchError.
    }
  };

  if (!isConnected) {
    return (
      <div className="wallet-connect-wrap">
        <button
          type="button"
          className="connect-wallet"
          disabled={!injected || isConnectPending || isConnecting}
          onClick={handleConnect}
          aria-label="Connect wallet"
        >
          <span>
            {isConnectPending || isConnecting
              ? 'Connecting…'
              : 'Connect wallet'}
          </span>
        </button>

        {connectError ? (
          <p className="wallet-error" role="alert">
            {connectError.shortMessage || connectError.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="wallet-area">
      {isWrongNetwork ? (
        <button
          type="button"
          className="network-warning"
          onClick={handleSwitchNetwork}
          disabled={isSwitching}
        >
          <span>
            {isSwitching
              ? 'Switching network…'
              : 'Switch to Arc Testnet'}
          </span>
        </button>
      ) : null}

      {switchError ? (
        <p className="wallet-error" role="alert">
          {switchError.shortMessage || switchError.message}
        </p>
      ) : null}

      <div className="wallet-balance">
        <span>Test balance</span>
        <strong>
          {Number(usdcBalance || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{' '}
          mUSDC
        </strong>
      </div>

      <button
        type="button"
        className="wallet-address"
        onClick={() => disconnect()}
        title="Disconnect wallet"
        aria-label={`Disconnect ${shortenAddress(address)}`}
      >
        <span className="wallet-status-dot" aria-hidden="true" />
        {shortenAddress(address)}
      </button>
    </div>
  );
}
