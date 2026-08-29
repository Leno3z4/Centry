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
  return number.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function formatAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
}

function errorText(error) {
  return error?.shortMessage || error?.message || 'The transaction could not be completed. Check your wallet, network, allowance, and contract state.';
}

export function SelfRepayingContent() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const selfRepay = useSelfRepayingVault();
  const [collateralAmount, setCollateralAmount] = useState('1');
  const [borrowAmount, setBorrowAmount] = useState('50');
  const [repayAmount, setRepayAmount] = useState('');
  const [notice, setNotice] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const networkReady = chainId === 5042002;
  const positionExists = Boolean(selfRepay.selectedPosition);
  const busy = selfRepay.transactionPending;
  const selected = selfRepay.selectedCollateral;
  const currentDebt = formatToken(selfRepay.currentDebt, 6, 6);

  const collateralAllowanceEnough = useMemo(() => {
    if (!collateralAmount || Number(collateralAmount) <= 0) return false;
    try {
      return selfRepay.collateralAllowance >= parseUnits(collateralAmount, selected.decimals);
    } catch {
      return false;
    }
  }, [collateralAmount, selfRepay.collateralAllowance, selected.decimals]);

  const repayLimit = useMemo(() => {
    try {
      return parseUnits(currentDebt, 6);
    } catch {
      return 0n;
    }
  }, [currentDebt]);

  const setCappedRepayAmount = (value) => {
    if (value === '') {
      setRepayAmount('');
      return;
    }

    if (!/^\d*(\.\d*)?$/.test(value)) return;

    try {
      const parsed = parseUnits(value || '0', 6);
      setRepayAmount(parsed > repayLimit ? currentDebt : value);
    } catch {
      setRepayAmount(currentDebt);
    }
  };

  const run = async (label, action) => {
    if (busy) return;
    setNotice('');
    setBusyAction(label);
    try {
      await action();
      await selfRepay.refetchAll();
      setNotice(`${label} confirmed.`);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusyAction('');
    }
  };

  const selectCollateral = (event) => {
    const asset = selfRepay.collateralAssets.find((item) => item.id === event.target.value);
    if (asset) {
      selfRepay.setSelectedCollateral(asset);
      setCollateralAmount('1');
      setNotice('');
    }
  };

  if (!selfRepay.configured) {
    return <main className={styles.page}><section className={styles.messageCard}><span className={styles.kicker}>SELF-REPAYING</span><h1>Configuration incomplete</h1><p>The self-repaying deployment configuration is incomplete.</p></section></main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.kicker}>CENTRY · SELF-REPAYING</span><h1>Let the yield pay the debt.</h1><p>Deposit collateral, borrow mUSDC, and let Centry handle the rest.</p></div>
        <div className={styles.network}><span className={styles.liveDot} />Arc Testnet</div>
      </header>

      {!isConnected ? (
        <section className={styles.messageCard}><span className={styles.kicker}>WALLET REQUIRED</span><h2>Connect your wallet.</h2><p>Connect to create and manage a Centry position.</p><WalletConnect /></section>
      ) : !networkReady ? (
        <section className={styles.messageCard}><span className={styles.kicker}>WRONG NETWORK</span><h2>Switch to Arc Testnet.</h2><p>Centry is currently configured for chain 5042002.</p></section>
      ) : (
        <section className={styles.card}>
          {!positionExists ? (
            <div className={styles.createView}>
              <div className={styles.cardTop}><div><span className={styles.kicker}>START HERE</span><h2>Create a position</h2></div></div>
              <label className={styles.label} htmlFor="collateral-asset">Choose collateral</label>
              <select id="collateral-asset" className={styles.select} value={selected.id} onChange={selectCollateral} disabled={busy}>
                {selfRepay.collateralAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} — {asset.name}</option>)}
              </select>
              <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => run('Create position', () => selfRepay.createPosition(selected.address))}>{busyAction === 'Create position' ? 'Creating…' : `Create ${selected.symbol} position`}</button>
            </div>
          ) : (
            <>
              <div className={styles.positionHeader}>
                <div><span className={styles.kicker}>YOUR POSITION</span><h2>{selected.symbol} position</h2><p>{formatToken(selfRepay.collateralSupplied, selected.decimals)} {selected.symbol} deposited</p></div>
                <div className={styles.debtBadge}>{currentDebt} mUSDC debt</div>
              </div>

              {selfRepay.positions.length > 1 ? (
                <div className={styles.positionSwitcher}>
                  <select value={selfRepay.selectedPosition} onChange={(event) => selfRepay.setSelectedPosition(event.target.value)} disabled={busy} aria-label="Choose position">
                    {selfRepay.positions.map((position) => <option key={position} value={position}>{formatAddress(position)}</option>)}
                  </select>
                  <button type="button" className={styles.textButton} disabled={busy} onClick={() => run('Create position', () => selfRepay.createPosition(selected.address))}>+ New</button>
                </div>
              ) : null}

              <div className={styles.formDivider} />
              <label className={styles.label} htmlFor="collateral">Add collateral</label>
              <div className={styles.inputRow}><input id="collateral" type="number" min="0" step="0.00000001" value={collateralAmount} onChange={(event) => setCollateralAmount(event.target.value)} /><span>{selected.symbol}</span></div>
              <div className={styles.helper}><span>{formatToken(selfRepay.collateralAllowance, selected.decimals)} approved</span><button type="button" onClick={() => setCollateralAmount(formatToken(selfRepay.collateralBalance, selected.decimals, 8))}>Max</button></div>
              <div className={styles.actions}>
                <button type="button" className={styles.secondaryButton} disabled={busy || !collateralAmount} onClick={() => run(`Approve ${selected.symbol}`, () => selfRepay.approveCollateral(collateralAmount))}>{busyAction === `Approve ${selected.symbol}` ? 'Approving…' : `Approve ${selected.symbol}`}</button>
                <button type="button" className={styles.primaryButton} disabled={busy || !collateralAmount || !collateralAllowanceEnough} onClick={() => run('Deposit collateral', () => selfRepay.depositCollateral(collateralAmount))}>{busyAction === 'Deposit collateral' ? 'Depositing…' : `Deposit ${selected.symbol}`}</button>
              </div>

              <label className={styles.label} htmlFor="borrow">Borrow mUSDC</label>
              <div className={styles.inputRow}><input id="borrow" type="number" min="0" step="0.000001" value={borrowAmount} onChange={(event) => setBorrowAmount(event.target.value)} /><span>mUSDC</span></div>
              <button type="button" className={styles.primaryButton} disabled={busy || !borrowAmount} onClick={() => run('Open position', () => selfRepay.openPosition(borrowAmount))}>{busyAction === 'Open position' ? 'Starting…' : 'Borrow mUSDC & start yield'}</button>

              <div className={styles.healthSection}>
                <div className={styles.healthHeader}><span>Position health</span><strong>{selfRepay.healthFactorPercent ?? '—'}%</strong></div>
                <div className={styles.healthTrack} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={selfRepay.healthFactorPercent ?? 0}><div className={styles.healthFill} style={{ width: `${Math.min(Math.max(Number(selfRepay.healthFactorPercent ?? 0), 0), 100)}%` }} /></div>
                <p className={styles.healthHint}>Your position is healthy when the bar stays above the risk zone.</p>
              </div>

              <label className={styles.label} htmlFor="repay">Repay debt</label>
              <div className={styles.inputRow}><input id="repay" type="text" inputMode="decimal" value={repayAmount} placeholder={currentDebt} onChange={(event) => setCappedRepayAmount(event.target.value)} /><span>mUSDC</span></div>
              <div className={styles.helper}><span>Owed {currentDebt} mUSDC</span><button type="button" onClick={() => setRepayAmount(currentDebt)}>Max</button></div>
              <button type="button" className={styles.secondaryButton} disabled={busy || !repayAmount || Number(repayAmount) <= 0} onClick={() => run('Repay debt', () => selfRepay.repay(repayAmount))}>{busyAction === 'Repay debt' ? 'Repaying…' : 'Repay debt'}</button>

              <p className={styles.note}>Your borrowed funds are put to work automatically. Yield is used to repay your debt.</p>
            </>
          )}
          {notice ? <div className={styles.notice}>{notice}</div> : null}
          {selfRepay.transactionHash ? <div className={styles.transaction}>Transaction {formatAddress(selfRepay.transactionHash)}</div> : null}
        </section>
      )}
    </main>
  );
}

export default function Page() {
  return <Providers><div className={styles.shell}><header className={styles.topbar}><a href="/app" className={styles.brand}><span>C</span>Centry</a><WalletConnect /></header><SelfRepayingContent /></div></Providers>;
}
