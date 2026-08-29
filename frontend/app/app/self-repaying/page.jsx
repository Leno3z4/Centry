'use client';

import { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { WalletConnect } from '../../../components/WalletConnect';
import { useSelfRepayingVault } from '../../../hooks/useSelfRepayingVault';
import styles from './self-repaying.module.css';

function formatToken(value, decimals = 6, digits = 4) {
  const number = Number(formatUnits(value ?? 0n, decimals));
  if (!Number.isFinite(number)) return '0';

  return number.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
}

function errorText(error) {
  return (
    error?.shortMessage ||
    error?.message ||
    'The transaction could not be completed. Check your wallet, network, allowance, and contract state.'
  );
}

export function SelfRepayingContent() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const selfRepay = useSelfRepayingVault();
  const [collateralAmount, setCollateralAmount] = useState('1');
  const [borrowAmount, setBorrowAmount] = useState('50');
  const [notice, setNotice] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const networkReady = chainId === 5042002;
  const positionExists = Boolean(selfRepay.selectedPosition);
  const busy = selfRepay.transactionPending;
  const selected = selfRepay.selectedCollateral;

  const collateralAllowanceEnough = useMemo(() => {
    if (!collateralAmount || Number(collateralAmount) <= 0) return false;

    try {
      return (
        selfRepay.collateralAllowance >=
        parseUnits(collateralAmount, selected.decimals)
      );
    } catch {
      return false;
    }
  }, [collateralAmount, selfRepay.collateralAllowance, selected.decimals]);

  const run = async (label, action) => {
    if (busy) return;

    setNotice('');
    setBusyAction(label);

    try {
      await action();
      await selfRepay.refetchAll();
      setNotice(`${label} confirmed onchain.`);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusyAction('');
    }
  };

  const selectCollateral = (event) => {
    const asset = selfRepay.collateralAssets.find(
      (item) => item.id === event.target.value,
    );

    if (asset) {
      selfRepay.setSelectedCollateral(asset);
      setCollateralAmount('1');
      setNotice('');
    }
  };

  if (!selfRepay.configured) {
    return (
      <main className={styles.page}>
        <section className={styles.messageCard}>
          <span className={styles.kicker}>SELF-REPAYING</span>
          <h1>Configuration incomplete</h1>
          <p>
            The public self-repaying deployment configuration is incomplete.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CENTRY · SELF-REPAYING</span>
          <h1>Let the yield pay the debt.</h1>
          <p>
            Deposit collateral, borrow mUSDC, and let Centry handle the rest.
          </p>
        </div>

        <div className={styles.network}>
          <span className={styles.liveDot} />
          Arc Testnet
        </div>
      </header>

      {!isConnected ? (
        <section className={styles.messageCard}>
          <span className={styles.kicker}>WALLET REQUIRED</span>
          <h2>Connect your wallet.</h2>
          <p>Connect to create and manage a Centry position.</p>
          <WalletConnect />
        </section>
      ) : !networkReady ? (
        <section className={styles.messageCard}>
          <span className={styles.kicker}>WRONG NETWORK</span>
          <h2>Switch to Arc Testnet.</h2>
          <p>Centry is currently configured for chain 5042002.</p>
        </section>
      ) : (
        <section className={styles.card}>
          <div className={styles.cardTop}>
            <div>
              <span className={styles.kicker}>POSITION</span>
              <h2>{positionExists ? 'Your position' : 'Create a position'}</h2>
            </div>

            {positionExists ? (
              <span className={styles.address}>
                {formatAddress(selfRepay.selectedPosition)}
              </span>
            ) : null}
          </div>

          {selfRepay.positions.length > 0 ? (
            <div className={styles.positionBar}>
              <select
                value={selfRepay.selectedPosition}
                onChange={(event) =>
                  selfRepay.setSelectedPosition(event.target.value)
                }
                disabled={busy}
                aria-label="Your Centry position"
              >
                {selfRepay.positions.map((position) => (
                  <option key={position} value={position}>
                    {formatAddress(position)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={styles.textButton}
                disabled={busy}
                onClick={() =>
                  run(
                    'Create position',
                    () => selfRepay.createPosition(selected.address),
                  )
                }
              >
                + New
              </button>
            </div>
          ) : null}

          {!positionExists ? (
            <>
              <label className={styles.label} htmlFor="collateral-asset">
                Collateral
              </label>

              <select
                id="collateral-asset"
                className={styles.select}
                value={selected.id}
                onChange={selectCollateral}
                disabled={busy}
              >
                {selfRepay.collateralAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.symbol} — {asset.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy}
                onClick={() =>
                  run(
                    'Create position',
                    () => selfRepay.createPosition(selected.address),
                  )
                }
              >
                {busyAction === 'Create position'
                  ? 'Creating…'
                  : `Create ${selected.symbol} position`}
              </button>
            </>
          ) : (
            <>
              <div className={styles.assetSummary}>
                <div>
                  <span>Collateral</span>
                  <strong>{selected.symbol}</strong>
                </div>
                <div>
                  <span>Wallet</span>
                  <strong>
                    {formatToken(
                      selfRepay.collateralBalance,
                      selected.decimals,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Debt</span>
                  <strong>
                    {formatToken(selfRepay.currentDebt, 6)} mUSDC
                  </strong>
                </div>
              </div>

              <label className={styles.label} htmlFor="collateral">
                Deposit collateral
              </label>

              <div className={styles.inputRow}>
                <input
                  id="collateral"
                  type="number"
                  min="0"
                  step="0.00000001"
                  value={collateralAmount}
                  onChange={(event) => setCollateralAmount(event.target.value)}
                />
                <span>{selected.symbol}</span>
              </div>

              <div className={styles.helper}>
                <span>
                  {formatToken(
                    selfRepay.collateralAllowance,
                    selected.decimals,
                  )}{' '}
                  approved
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCollateralAmount(
                      formatToken(
                        selfRepay.collateralBalance,
                        selected.decimals,
                        8,
                      ),
                    )
                  }
                >
                  Max
                </button>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy || !collateralAmount}
                  onClick={() =>
                    run(
                      `Approve ${selected.symbol}`,
                      () => selfRepay.approveCollateral(collateralAmount),
                    )
                  }
                >
                  {busyAction === `Approve ${selected.symbol}`
                    ? 'Approving…'
                    : `Approve ${selected.symbol}`}
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    busy || !collateralAmount || !collateralAllowanceEnough
                  }
                  onClick={() =>
                    run('Deposit collateral', () =>
                      selfRepay.depositCollateral(collateralAmount),
                    )
                  }
                >
                  {busyAction === 'Deposit collateral'
                    ? 'Depositing…'
                    : `Deposit ${selected.symbol}`}
                </button>
              </div>

              <label className={styles.label} htmlFor="borrow">
                Borrow
              </label>

              <div className={styles.inputRow}>
                <input
                  id="borrow"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={borrowAmount}
                  onChange={(event) => setBorrowAmount(event.target.value)}
                />
                <span>mUSDC</span>
              </div>

              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy || !borrowAmount}
                onClick={() =>
                  run('Open position', () =>
                    selfRepay.openPosition(borrowAmount),
                  )
                }
              >
                {busyAction === 'Open position'
                  ? 'Starting…'
                  : 'Borrow mUSDC'}
              </button>

              <p className={styles.note}>
                Yield generated by the position is used to repay the debt.
              </p>
            </>
          )}

          {notice ? <div className={styles.notice}>{notice}</div> : null}
          {selfRepay.transactionHash ? (
            <div className={styles.transaction}>
              Transaction {formatAddress(selfRepay.transactionHash)}
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Providers>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <a href="/app" className={styles.brand}>
            <span>C</span>
            Centry
          </a>
          <WalletConnect />
        </header>
        <SelfRepayingContent />
      </div>
    </Providers>
  );
}
