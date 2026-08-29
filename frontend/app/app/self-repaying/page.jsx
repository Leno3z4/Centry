'use client';

import { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { WalletConnect } from '../../../components/WalletConnect';
import { useSelfRepayingVault } from '../../../hooks/useSelfRepayingVault';
import styles from './self-repaying.module.css';

const MIN_HARVEST = 100000n;

function formatToken(value, decimals = 6, digits = 4) {
  const number = Number(formatUnits(value ?? 0n, decimals));
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function formatAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
}

function errorText(error) {
  return error?.shortMessage || error?.message || 'The transaction could not be completed. Check wallet, network, allowance, and contract state.';
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
    try { return selfRepay.collateralAllowance >= parseUnits(collateralAmount, selected.decimals); } catch { return false; }
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
    const asset = selfRepay.collateralAssets.find((item) => item.id === event.target.value);
    if (asset) {
      selfRepay.setSelectedCollateral(asset);
      setCollateralAmount('1');
      setNotice('');
    }
  };

  if (!selfRepay.configured) {
    return <main className={styles.page}><section className={styles.configCard}><span className={styles.kicker}>SELF-REPAYING</span><h1>Configuration incomplete</h1><p>The public self-repaying deployment configuration is incomplete.</p></section></main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.kicker}>CENTRY · SELF-REPAYING</span><h1>Let the yield pay the debt.</h1><p>Choose supported collateral, borrow mUSDC, route it through Centry's yield vault, and use realized yield to reduce the debt.</p></div>
        <div className={styles.headerMeta}><span className={styles.liveDot} />Arc Testnet<span className={styles.chain}>5042002</span></div>
      </header>

      {!isConnected ? (
        <section className={styles.connectCard}><span className={styles.kicker}>WALLET REQUIRED</span><h2>Connect a wallet to manage your position.</h2><p>Your position data is read from the deployed contracts after connection.</p><WalletConnect /></section>
      ) : !networkReady ? (
        <section className={styles.connectCard}><span className={styles.kicker}>WRONG NETWORK</span><h2>Switch to Arc Testnet.</h2><p>Centry's deployed self-repaying contracts are configured for chain 5042002.</p></section>
      ) : (
        <>
          <section className={styles.positionPicker}>
            <div><span className={styles.kicker}>YOUR POSITIONS</span><h2>{selfRepay.positions.length} deployed position{selfRepay.positions.length === 1 ? '' : 's'}</h2></div>
            <div className={styles.positionSelectRow}>
              <select value={selfRepay.selectedPosition} onChange={(event) => selfRepay.setSelectedPosition(event.target.value)} disabled={busy || selfRepay.positions.length === 0}>
                {selfRepay.positions.length === 0 ? <option value="">No positions yet</option> : selfRepay.positions.map((position) => <option key={position} value={position}>{formatAddress(position)}</option>)}
              </select>
              <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => run('Create position', () => selfRepay.createPosition(selected.address))}>{busyAction === 'Create position' ? 'Creating…' : `Create ${selected.symbol} position`}</button>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}><div><span className={styles.kicker}>COLLATERAL</span><h2>Choose your collateral</h2></div><span className={styles.address}>{selected.symbol}</span></div>
            <div className={styles.positionSelectRow}>
              <select value={selected.id} onChange={selectCollateral} disabled={busy} aria-label="Collateral asset">
                {selfRepay.collateralAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} — {asset.name}</option>)}
              </select>
            </div>
            <div className={styles.metrics}>
              <div className={styles.metric}><span>Selected asset</span><strong>{selected.symbol}</strong><small>{selected.name}</small></div>
              <div className={styles.metric}><span>Wallet balance</span><strong>{formatToken(selfRepay.collateralBalance, selected.decimals)} {selected.symbol}</strong><small>Mock collateral balance</small></div>
              <div className={styles.metric}><span>Position collateral</span><strong>{formatToken(selfRepay.collateralSupplied, selected.decimals)} {selected.symbol}</strong><small>Supplied to LendingPool</small></div>
              <div className={styles.metric}><span>Borrow asset</span><strong>mUSDC</strong><small>6 decimal debt asset</small></div>
            </div>
          </section>

          <section className={styles.metrics}>
            <div className={styles.metric}><span>Current debt</span><strong>{formatToken(selfRepay.currentDebt, 6)} mUSDC</strong><small>Live pool debt</small></div>
            <div className={styles.metric}><span>Yield assets</span><strong>{formatToken(selfRepay.currentYieldAssets, 6)} mUSDC</strong><small>Current cYLD value</small></div>
            <div className={styles.metric}><span>Harvestable profit</span><strong>{formatToken(selfRepay.harvestableProfit, 6)} mUSDC</strong><small>{selfRepay.harvestableProfit >= MIN_HARVEST ? 'Keeper eligible' : 'Below 0.1 mUSDC threshold'}</small></div>
            <div className={styles.metric}><span>Health factor</span><strong>{selfRepay.healthFactor > 0n ? formatToken(selfRepay.healthFactor, 18, 2) : '—'}</strong><small>Live position risk</small></div>
          </section>

          <section className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.cardHead}><div><span className={styles.kicker}>POSITION SETUP</span><h2>{positionExists ? `Manage ${selected.symbol} position` : `Create a ${selected.symbol} position`}</h2></div><span className={styles.address}>{formatAddress(selfRepay.selectedPosition)}</span></div>
              {!positionExists ? (
                <div className={styles.emptyState}><p>The factory will deploy an isolated position using the selected collateral asset.</p><button type="button" className={styles.primaryButton} disabled={busy} onClick={() => run('Create position', () => selfRepay.createPosition(selected.address))}>{busyAction === 'Create position' ? 'Creating…' : `Create ${selected.symbol} position`}</button></div>
              ) : (
                <>
                  <label className={styles.label} htmlFor="collateral">Collateral amount</label>
                  <div className={styles.inputRow}><input id="collateral" type="number" min="0" step="0.00000001" value={collateralAmount} onChange={(event) => setCollateralAmount(event.target.value)} /><span>{selected.symbol}</span></div>
                  <div className={styles.helper}><span>Allowance: {formatToken(selfRepay.collateralAllowance, selected.decimals)} {selected.symbol}</span><button type="button" onClick={() => setCollateralAmount(formatToken(selfRepay.collateralBalance, selected.decimals, 8))}>Max</button></div>
                  <button type="button" className={styles.primaryButton} disabled={busy || !collateralAmount} onClick={() => run(`Approve ${selected.symbol}`, () => selfRepay.approveCollateral(collateralAmount))}>{busyAction === `Approve ${selected.symbol}` ? 'Approving…' : `Approve ${selected.symbol}`}</button>
                  <button type="button" className={styles.secondaryButtonFull} disabled={busy || !collateralAmount || !collateralAllowanceEnough} onClick={() => run('Deposit collateral', () => selfRepay.depositCollateral(collateralAmount))}>{busyAction === 'Deposit collateral' ? 'Depositing…' : `Deposit ${selected.symbol}`}</button>
                  <label className={styles.label} htmlFor="borrow">Borrow amount</label>
                  <div className={styles.inputRow}><input id="borrow" type="number" min="0" step="0.000001" value={borrowAmount} onChange={(event) => setBorrowAmount(event.target.value)} /><span>mUSDC</span></div>
                  <button type="button" className={styles.primaryButton} disabled={busy || !borrowAmount} onClick={() => run('Open position', () => selfRepay.openPosition(borrowAmount))}>{busyAction === 'Open position' ? 'Opening…' : 'Borrow mUSDC & start yield'}</button>
                </>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHead}><div><span className={styles.kicker}>REPAYMENT</span><h2>Yield automation</h2></div><span className={selfRepay.harvestableProfit >= MIN_HARVEST ? styles.eligible : styles.waiting}>{selfRepay.harvestableProfit >= MIN_HARVEST ? 'Eligible' : 'Waiting'}</span></div>
              <div className={styles.detailRows}>
                <div><span>Collateral</span><strong>{formatToken(selfRepay.collateralSupplied, selected.decimals)} {selected.symbol}</strong></div>
                <div><span>Yield principal</span><strong>{formatToken(selfRepay.yieldPrincipal, 6)} mUSDC</strong></div>
                <div><span>Total repaid</span><strong>{formatToken(selfRepay.totalRepaid, 6)} mUSDC</strong></div>
                <div><span>Current debt</span><strong>{formatToken(selfRepay.currentDebt, 6)} mUSDC</strong></div>
                <div><span>Harvest threshold</span><strong>0.1 mUSDC</strong></div>
              </div>
              <button type="button" className={styles.primaryButton} disabled={busy || selfRepay.harvestableProfit < MIN_HARVEST || !selfRepay.positionOpen} onClick={() => run('Harvest and repay', selfRepay.harvestAndRepay)}>{busyAction === 'Harvest and repay' ? 'Repaying…' : 'Harvest and repay now'}</button>
              <button type="button" className={styles.dangerButton} disabled={busy || !selfRepay.positionOpen || selfRepay.currentDebt > 0n} onClick={() => run('Close position', selfRepay.closePosition)}>{busyAction === 'Close position' ? 'Closing…' : 'Close debt-free position'}</button>
            </div>
          </section>

          {notice ? <div className={styles.notice}>{notice}</div> : null}
          {selfRepay.transactionHash ? <div className={styles.transaction}>Last transaction: {formatAddress(selfRepay.transactionHash)}</div> : null}
        </>
      )}
    </main>
  );
}

export default function Page() {
  return <Providers><div className={styles.shell}><header className={styles.topbar}><a href="/app" className={styles.brand}><span>C</span> Centry</a><WalletConnect /></header><SelfRepayingContent /></div></Providers>;
}
