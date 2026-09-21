'use client';

import React, { useEffect, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from 'wagmi';
import { arcMainnet } from '../config/multiWagmi';
import { useLendingPool } from '../hooks/useLendingPool';

function shortenAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function connectorLabel(connector) {
  return connector?.name || 'Browser wallet';
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
    chainId !== arcMainnet.id;

  useEffect(() => {
    if (!pickerOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPickerOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [pickerOpen]);

  const handleConnectorSelect = async (connector) => {
    if (isConnectPending || isConnecting) {
      return;
    }

    try {
      await connect({ connector });
      setPickerOpen(false);
    } catch {
      // wagmi exposes the connection error through connectError.
    }
  };

  const handleSwitchNetwork = async () => {
    if (isSwitching) {
      return;
    }

    try {
      await switchChain({ chainId: arcMainnet.id });
    } catch {
      // wagmi exposes the switch error through switchError.
    }
  };

  if (!isConnected) {
    return (
      <>
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
        </div>

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
                <div className="wallet-picker-heading">
                  <span className="wallet-picker-kicker">CENTRY WALLET</span>
                  <h2 id="wallet-picker-title">Connect a wallet</h2>
                  <p>
                    Choose a wallet to use with Centry on Arc Mainnet.
                  </p>
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

              <div className="wallet-picker-divider" />

              <div className="wallet-options">
                {connectors.length > 0 ? (
                  connectors.map((connector) => {
                    const label = connectorLabel(connector);
                    const isWalletConnect =
                      connector.type === 'walletConnect' ||
                      label.toLowerCase().includes('walletconnect');

                    return (
                      <button
                        key={connector.uid}
                        type="button"
                        className="wallet-option"
                        onClick={() => handleConnectorSelect(connector)}
                        disabled={isConnectPending || isConnecting}
                      >
                        <span
                          className={`wallet-option-mark${
                            isWalletConnect ? ' is-walletconnect' : ''
                          }`}
                          aria-hidden="true"
                        >
                          {label.slice(0, 1).toUpperCase()}
                        </span>

                        <span className="wallet-option-copy">
                          <strong>{label}</strong>
                          <small>
                            {isWalletConnect
                              ? 'Connect with WalletConnect'
                              : connector.type === 'injected'
                                ? 'Browser extension'
                                : 'Wallet connection'}
                          </small>
                        </span>

                        <span className="wallet-option-action">
                          {isConnectPending || isConnecting
                            ? 'Connecting'
                            : 'Select'}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="wallet-empty-state">
                    <strong>No compatible wallet found</strong>
                    <span>
                      Install a compatible browser wallet or use WalletConnect.
                    </span>
                  </div>
                )}
              </div>

              <div className="wallet-picker-footer">
                <span className="wallet-security-dot" aria-hidden="true" />
                <span>Connection requests are approved in your wallet</span>
              </div>

              {connectError ? (
                <p className="wallet-error" role="alert">
                  {connectError.shortMessage || connectError.message}
                </p>
              ) : null}
            </section>
          </div>
        ) : null}

        <style jsx global>{`
          .wallet-connect-wrap {
            display: flex;
            align-items: center;
          }

          .wallet-connect-wrap .connect-wallet {
            min-height: 44px;
            padding: 10px 16px;
            border: 1px solid #c9c0ff;
            border-radius: 11px;
            background: #b7a7ff;
            color: #0d0d10;
            box-shadow: none;
            font-size: 12px;
            font-weight: 700;
            transition: transform 160ms ease, filter 160ms ease;
          }

          .wallet-connect-wrap .connect-wallet:hover:not(:disabled) {
            transform: translateY(-1px);
            filter: none;
          }

          .wallet-picker-backdrop {
            position: fixed;
            z-index: 99999;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: rgba(4, 3, 9, 0.78);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
          }

          .wallet-picker {
            width: min(100%, 460px);
            max-height: min(720px, calc(100vh - 48px));
            overflow-y: auto;
            padding: 24px;
            border: 1px solid #3c2d52;
            border-radius: 20px;
            background: #0e1013;
            box-shadow: 0 24px 70px rgba(0, 0, 0, 0.52);
          }

          .wallet-picker-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 18px;
          }

          .wallet-picker-heading {
            min-width: 0;
          }

          .wallet-picker-kicker {
            color: #a98de0;
            font: 10px 'DM Mono', monospace;
            letter-spacing: 1.8px;
            text-transform: uppercase;
          }

          .wallet-picker-heading h2 {
            margin: 7px 0 8px;
            color: #f8f5ff;
            font-size: 25px;
            line-height: 1.1;
            letter-spacing: -0.8px;
          }

          .wallet-picker-heading p {
            margin: 0;
            color: #9e95ad;
            font-size: 12px;
            line-height: 1.55;
          }

          .wallet-picker-close {
            flex: 0 0 auto;
            min-height: 36px;
            padding: 8px 11px;
            border: 1px solid #3d3150;
            border-radius: 9px;
            background: #100c18;
            color: #bcb3c9;
            font-size: 11px;
            font-weight: 600;
          }

          .wallet-picker-close:hover {
            border-color: #63467f;
            color: #fff;
          }

          .wallet-picker-divider {
            height: 1px;
            margin: 20px 0 14px;
            background: #282033;
          }

          .wallet-options {
            display: grid;
            gap: 9px;
          }

          .wallet-option {
            display: grid;
            width: 100%;
            grid-template-columns: 44px minmax(0, 1fr) auto;
            align-items: center;
            gap: 12px;
            min-height: 72px;
            padding: 11px;
            border: 1px solid #2f2540;
            border-radius: 14px;
            background: rgba(13, 9, 21, 0.84);
            color: #fff;
            text-align: left;
            transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;
          }

          .wallet-option:hover:not(:disabled) {
            border-color: #654493;
            background: rgba(22, 15, 36, 0.98);
            transform: translateY(-1px);
          }

          .wallet-option-mark {
            display: grid;
            width: 44px;
            height: 44px;
            place-items: center;
            border: 1px solid #4e3a67;
            border-radius: 13px;
            background: linear-gradient(145deg, #24163b, #130d1f);
            color: #cfb6ff;
            font-size: 16px;
            font-weight: 800;
          }

          .wallet-option-mark.is-walletconnect {
            background: linear-gradient(145deg, #2a1746, #171021);
            color: #cba6ff;
          }

          .wallet-option-copy {
            display: grid;
            min-width: 0;
            gap: 4px;
          }

          .wallet-option-copy strong {
            overflow: hidden;
            color: #f7f3ff;
            font-size: 13px;
            font-weight: 700;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .wallet-option-copy small {
            overflow: hidden;
            color: #81778f;
            font-size: 10px;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .wallet-option-action {
            min-width: 60px;
            color: #aa83e6;
            font-size: 10px;
            font-weight: 700;
            text-align: right;
          }

          .wallet-empty-state {
            display: grid;
            gap: 7px;
            padding: 22px;
            border: 1px dashed #3a2d4c;
            border-radius: 13px;
            background: rgba(11, 8, 17, 0.55);
          }

          .wallet-empty-state strong {
            color: #f4f0fb;
            font-size: 13px;
          }

          .wallet-empty-state span {
            color: #847a91;
            font-size: 11px;
            line-height: 1.5;
          }

          .wallet-picker-footer {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 16px;
            color: #71677d;
            font-size: 9px;
          }

          .wallet-security-dot {
            width: 6px;
            height: 6px;
            flex: 0 0 auto;
            border-radius: 50%;
            background: #55dca1;
            box-shadow: 0 0 10px rgba(85, 220, 161, 0.65);
          }

          .wallet-error {
            margin: 12px 0 0;
            padding: 10px 12px;
            border: 1px solid #633243;
            border-radius: 10px;
            background: rgba(94, 30, 52, 0.26);
            color: #f2a5b7;
            font-size: 10px;
            line-height: 1.5;
          }

          .wallet-area {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .wallet-address {
            min-height: 40px;
            padding: 9px 11px;
            border: 1px solid #30263d;
            border-radius: 10px;
            background: #0e0a16;
            color: #d8cfe5;
            font: 10px 'DM Mono', monospace;
          }

          .wallet-address:hover {
            border-color: #5b3f79;
            color: #fff;
          }

          .wallet-status-dot {
            display: inline-block;
            width: 6px;
            height: 6px;
            margin-right: 7px;
            border-radius: 50%;
            background: #55dca1;
            box-shadow: 0 0 9px rgba(85, 220, 161, 0.65);
          }

          .network-warning {
            border: 1px solid #71512d;
            border-radius: 10px;
            background: #21170c;
            color: #e3b984;
          }

          @media (max-width: 640px) {
            .wallet-picker-backdrop {
              align-items: flex-end;
              padding: 10px;
            }

            .wallet-picker {
              width: 100%;
              max-height: calc(100vh - 20px);
              padding: 18px;
              border-radius: 18px;
            }

            .wallet-picker-heading h2 {
              font-size: 22px;
            }

            .wallet-option {
              grid-template-columns: 42px minmax(0, 1fr) auto;
              min-height: 66px;
            }

            .wallet-option-mark {
              width: 42px;
              height: 42px;
            }

            .wallet-option-action {
              min-width: 48px;
            }
          }

          /* Apple utility chrome */
          .wallet-connect-wrap .connect-wallet {
            min-height: 44px;
            padding: 10px 16px;
            border: 1px solid #0071e3;
            border-radius: 11px;
            background: #0071e3;
            color: #fff;
            box-shadow: none;
            font: inherit;
            font-size: 14px;
            font-weight: 600;
            transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
          }

          .wallet-connect-wrap .connect-wallet:hover:not(:disabled) {
            border-color: #0066cc;
            background: #0066cc;
            transform: none;
            filter: none;
          }

          .wallet-picker-backdrop {
            background: rgba(0, 0, 0, .32);
            backdrop-filter: blur(20px) saturate(130%);
            -webkit-backdrop-filter: blur(20px) saturate(130%);
          }

          .wallet-picker {
            border: 1px solid rgba(210, 210, 215, .9);
            border-radius: 20px;
            background: rgba(255, 255, 255, .95);
            color: #1d1d1f;
            box-shadow: 0 28px 80px rgba(0, 0, 0, .18);
            backdrop-filter: blur(20px) saturate(140%);
          }

          .wallet-picker-kicker {
            color: #6e6e73;
            font-family: var(--display-font, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif);
            letter-spacing: 0;
            text-transform: none;
          }

          .wallet-picker-heading h2,
          .wallet-option-copy strong,
          .wallet-empty-state strong {
            color: #1d1d1f;
          }

          .wallet-picker-heading p,
          .wallet-option-copy small,
          .wallet-empty-state span,
          .wallet-picker-footer {
            color: #6e6e73;
          }

          .wallet-picker-divider {
            background: #e5e5ea;
          }

          .wallet-picker-close {
            border: 1px solid #d2d2d7;
            border-radius: 9px;
            background: #fff;
            color: #1d1d1f;
          }

          .wallet-picker-close:hover {
            border-color: #b7b7bc;
            color: #1d1d1f;
          }

          .wallet-option {
            border: 1px solid #e5e5ea;
            border-radius: 14px;
            background: #fff;
            color: #1d1d1f;
            transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
          }

          .wallet-option:hover:not(:disabled) {
            border-color: #b7b7bc;
            background: #f8f8fa;
            transform: none;
          }

          .wallet-option-mark,
          .wallet-option-mark.is-walletconnect {
            border: 1px solid #d2d2d7;
            border-radius: 12px;
            background: #f5f5f7;
            color: #1d1d1f;
          }

          .wallet-option-action {
            color: #0071e3;
          }

          .wallet-empty-state {
            border-color: #d2d2d7;
            background: #f5f5f7;
          }

          .wallet-picker-footer {
            color: #6e6e73;
          }

          .wallet-security-dot,
          .wallet-status-dot {
            background: #34c759;
            box-shadow: none;
          }

          .wallet-error {
            border-color: rgba(255, 59, 48, .22);
            background: rgba(255, 59, 48, .06);
            color: #b42318;
          }

          .wallet-address {
            min-height: 42px;
            border: 1px solid #d2d2d7;
            border-radius: 11px;
            background: #fff;
            color: #1d1d1f;
            font-family: var(--mono-font, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
          }

          .wallet-address:hover {
            border-color: #b7b7bc;
            background: #f8f8fa;
            color: #1d1d1f;
          }

          .network-warning {
            border: 1px solid rgba(255, 159, 10, .34);
            border-radius: 11px;
            background: rgba(255, 159, 10, .1);
            color: #7a5310;
          }
        `}</style>
      </>
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
          {isSwitching ? 'Switching network…' : 'Switch to Arc Mainnet'}
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
          USDC
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
