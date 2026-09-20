'use client';

import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { useGatewayFunding } from '../../../hooks/useGatewayFunding';
import { ARC_GATEWAY_CHAIN } from '../../../lib/gatewayFunding';
import styles from './gateway.module.css';

const USDC_ABI = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] }];
function numberText(value) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '0.00'; }

function GatewayContent() {
  const { address, isConnected } = useAccount();
  const gateway = useGatewayFunding();
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState('');
  const [txHash, setTxHash] = useState('');
  const { data: arcBalanceRaw, isLoading: arcBalanceLoading, refetch: refetchArcBalance } = useReadContract({ address: ARC_GATEWAY_CHAIN.usdc, abi: USDC_ABI, functionName: 'balanceOf', args: [address], query: { enabled: Boolean(address) } });

  const arcBalance = arcBalanceRaw === undefined ? '0' : formatUnits(arcBalanceRaw, 6);
  const gatewayTotal = gateway.total || '0';
  const unifiedAvailable = Number(arcBalance) + Number(gatewayTotal);
  const validAmount = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0;

  const refresh = async () => {
    setNotice('Refreshing liquidity balances…');
    try { await Promise.all([gateway.refresh(), refetchArcBalance()]); setNotice('Liquidity balances refreshed.'); }
    catch (error) { setNotice(error?.message || 'Unable to refresh Gateway liquidity right now.'); }
  };

  const prepareOnArc = async () => {
    if (!isConnected || !validAmount || gateway.loading) return;
    setNotice('Checking unified USDC liquidity…'); setTxHash('');
    try {
      const result = await gateway.ensureArcUsdc(amount, { arcBalance });
      if (result.usedGateway) { setTxHash(result.mintHash || ''); setNotice(`${amount} USDC is now available through your Arc Gateway balance.`); }
      else setNotice(`${amount} USDC is already available on Arc. No Gateway transfer was needed.`);
      await refetchArcBalance(); setAmount(''); await gateway.refresh();
    } catch (error) { setNotice(error?.message || 'Gateway funding could not be completed.'); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div><div className={styles.kicker}>UNIFIED USDC LIQUIDITY</div><h1>Gateway</h1><p>Centry treats USDC across supported Gateway sources as one liquidity layer, while Arc remains the execution environment for lending.</p></div>
        <div className={styles.statusPill}><i />Arc Mainnet</div>
      </div>

      {!isConnected ? <div className={styles.notice}>Connect your wallet to view your unified USDC liquidity.</div> : (
        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.cardHeader}><div><div className={styles.kicker}>FUNDING ROUTER</div><h2>Make USDC available on Arc</h2></div><button type="button" className={styles.refreshButton} onClick={refresh} disabled={gateway.loading || arcBalanceLoading}>Refresh</button></div>
            <div className={styles.totalCard}><span>Unified available</span><strong>{numberText(unifiedAvailable)} USDC</strong><small>Arc wallet + finalized Gateway balances</small></div>
            <label className={styles.fieldLabel} htmlFor="gateway-amount">Amount to make available</label>
            <div className={styles.amountField}><input id="gateway-amount" type="number" min="0" step="0.000001" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /><span>USDC</span></div>
            <div className={styles.metaRow}><span>Gateway balance</span><strong>{numberText(gatewayTotal)} USDC</strong></div>
            <div className={styles.metaRow}><span>Arc wallet</span><strong>{numberText(arcBalance)} USDC</strong></div>
            <div className={styles.metaRow}><span>Pending Gateway deposits</span><strong>{numberText(gateway.pendingTotal)} USDC</strong></div>
            <button type="button" className={styles.primaryButton} disabled={!validAmount || gateway.loading} onClick={prepareOnArc}>{gateway.loading ? 'Refreshing liquidity…' : `Make ${amount || '0'} USDC available on Arc`}</button>
            {notice && <div className={styles.notice}>{notice}</div>}
            {txHash && <a className={styles.txLink} href={`${ARC_GATEWAY_CHAIN.explorerUrl}/tx/${txHash}`} target="_blank" rel="noreferrer">View Arc Gateway mint transaction →</a>}
            <p className={styles.helper}>Centry checks the Arc wallet first. Gateway is only used when the selected amount cannot already be satisfied by USDC on Arc.</p>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}><div><div className={styles.kicker}>BALANCE SOURCES</div><h2>Where your USDC sits</h2></div><span className={styles.contractTag}>Gateway Mainnet</span></div>
            <div className={styles.balanceList}>
              <div className={styles.balanceRow}><div><strong>Arc Mainnet</strong><small>Directly usable by Centry LendingPool</small></div><strong>{numberText(arcBalance)} USDC</strong></div>
              {gateway.balances.map((balance) => <div className={styles.balanceRow} key={balance.id}><div><strong>{balance.name}</strong><small>{balance.spendable ? `Finalized Gateway USDC${balance.pendingCount ? ` · ${balance.pendingCount} pending` : ''}` : 'Pending or unavailable'}</small></div><strong>{numberText(balance.balance)} USDC</strong></div>)}
            </div>
            <div className={styles.infoBox}><strong>How Centry routes liquidity</strong><span>When a supply needs USDC on Arc, Centry first checks the connected Arc wallet. Only the missing finalized liquidity is funded through Gateway, then the existing Centry LendingPool supply flow continues.</span></div>
            <p className={styles.disclaimer}>Pending deposits are shown separately and are not counted as spendable Gateway liquidity until Circle processes them.</p>
          </section>
        </div>
      )}
    </div>
  );
}

export default function Page() { return <Providers><AppShell><GatewayContent /></AppShell></Providers>; }
