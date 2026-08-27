'use client';

import React, { useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from 'wagmi';
import { arcTestnet } from '../config/multiWagmi';
import { useLendingPool } from '../hooks/useLendingPool';

function shortenAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function connectorLabel(connector) {
  if (connector.name) return connector.name;
  return 'Browser wallet';
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
  const [pickerOpen, setPickerOpen] = useState(false);

  const isWrongNetwork =
    isConnected &&
    chainId !== arcTestnet.id;

  const handleConnectorSelect = async (connector) => {
    if (isConnectPending || isConnecting) return;

    try {
      await connect({ connector });
      setPickerOpen(false);
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
          onClick={() => setPickerOpen(true)}
          disabled={isConnectPending || isConnecting}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
        >
          Connect wallet
        </button>

        {pickerOpen ? (
          <div
            className="wallet-picker-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setPickerOpen(false);
              }
            }}
          >
            <section
              className="wallet-picker"
              role="dialog"
              aria-modal="true"
              aria-labelledby="wallet-picker-title"
            >
              <div className="wallet-picker-header">
                <div>
                  <span className="section-kicker">WALLET</span>
                  <h2 id="wallet-picker-title">Connect a wallet</h2>
                  <p>Choose which wallet you want to use with Centry.</p>
                </div>
                <button
                  type="button"
                  className="wallet-picker-close"
                  onClick={() => setPickerOpen(false)}
                  aria-label="Close wallet picker"
                >
                  Close
                </button>
              </div>

              <div className="wallet-options">
                {connectors.length > 0 ? (
                  connectors.map((connector) => (
                    <button
                      key={connector.uid}
                      type="button"
                      className="wallet-option"
                      onClick={() => handleConnectorSelect(connector)}
                      disabled={isConnectPending || isConnecting}
                    >
                      <span className="wallet-option-mark">
                        {connectorLabel(connector).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="wallet-option-copy">
                        <strong>{connectorLabel(connector)}</strong>
                        <small>
                          {connector.type === 'injected'
                            ? 'Browser extension'
                            : 'Wallet connector'}
                        </small>
                      </span>
                      <span className="wallet-option-action">Connect</span>
                    </button>
                  ))
                ) : (
                  <div className="wallet-empty-state">
                    <strong>No compatible wallet found</strong>
                    <span>
                      Install a browser wallet such as MetaMask, then refresh the page.
                    </span>
                  </div>
                )}
              </div>

              {connectError ? (
                <p className="wallet-error" role="alert">
                  {connectError.shortMessage || connectError.message}
                </p>
              ) : null}
            </section>
          </div>
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
          {isSwitching ? 'Switching network…' : 'Switch to Arc Testnet'}
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
