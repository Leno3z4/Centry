'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useReadContract, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { MARKETS } from '../../../constants/markets';
import { ERC20_ABI } from '../../../constants/abis';
import styles from './swap.module.css';

const LIVE_MARKETS = MARKETS.filter((market) => market.status === 'live' && market.address);
const ARC_CHAIN_ID = 5042002;
const TOWER_QUOTE_DECIMALS = 18;

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatQuoteAmount(raw, outputDecimals) {
  if (raw == null || outputDecimals == null) return '—';
  try {
    let displayRaw = BigInt(String(raw));
    if (outputDecimals < TOWER_QUOTE_DECIMALS) {
      displayRaw /= 10n ** BigInt(TOWER_QUOTE_DECIMALS - outputDecimals);
    } else if (outputDecimals > TOWER_QUOTE_DECIMALS) {
      displayRaw *= 10n ** BigInt(outputDecimals - TOWER_QUOTE_DECIMALS);
    }
    const formatted = formatUnits(displayRaw, outputDecimals);
    const [whole, fraction = ''] = formatted.split('.');
    const trimmed = fraction.slice(0, 8).replace(/0+$/, '');
    const normalized = trimmed ? `${whole}.${trimmed}` : whole;
    const number = Number(normalized);
    return Number.isFinite(number)
      ? number.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: Math.min(8, trimmed.length) })
      : normalized;
  } catch {
    return '—';
  }
}

// Tower returns priceImpact as a percentage, not basis points.
// Example from Tower docs: 0.02 means 0.02% impact.
function formatPriceImpact(value) {
  const parsed = safeNumber(value);
  if (parsed == null) return '—';
  return `${parsed.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

function errorText(error) {
  return error?.shortMessage || error?.message || 'The transaction could not be completed.';
}

function TokenDropdown({ value, markets, onChange, label }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = markets.find((market) => market.id === value) || markets[0];

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div className={styles.tokenPicker} ref={rootRef}>
      <button type="button" className={`${styles.tokenTrigger} ${open ? styles.tokenTriggerOpen : ''}`} onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open} aria-label={label}>
        <span className={`${styles.tokenIcon} ${styles[`tokenIcon_${selected?.id || 'usdc'}`]}`}>{selected?.symbol === 'cirBTC' ? '₿' : selected?.symbol === 'EURC' ? '€' : selected?.symbol === 'CENT' ? 'C' : '$'}</span>
        <span className={styles.tokenTriggerText}><strong>{selected?.symbol || '—'}</strong><small>{selected?.name || ''}</small></span>
        <span className={`${styles.tokenChevron} ${open ? styles.tokenChevronOpen : ''}`}>⌄</span>
      </button>
      {open && <div className={styles.tokenMenu} role="listbox" aria-label={label}>
        {markets.map((market) => <button key={market.id} type="button" role="option" aria-selected={market.id === value} className={`${styles.tokenOption} ${market.id === value ? styles.tokenOptionActive : ''}`} onClick={() => { onChange(market.id); setOpen(false); }}>
          <span className={`${styles.tokenIcon} ${styles[`tokenIcon_${market.id}`]}`}>{market.symbol === 'cirBTC' ? '₿' : market.symbol === 'EURC' ? '€' : market.symbol === 'CENT' ? 'C' : '$'}</span>
          <span className={styles.tokenOptionText}><strong>{market.symbol}</strong><small>{market.name}</small></span>
          {market.id === value ? <span className={styles.tokenCheck}>✓</span> : null}
        </button>)}
      </div>}
    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><SwapContent /></AppShell></Providers>;
}

function SwapContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switchingNetwork } = useSwitchChain();
  const { sendTransactionAsync, isPending: walletPending } = useSendTransaction();
  const [fromId, setFromId] = useState('usdc');
  const [toId, setToId] = useState('eurc');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.50');
  const [quote, setQuote] = useState(null);
  const [preparedTransactions, setPreparedTransactions] = useState(null);
  const [swapTx, setSwapTx] = useState(null);
  const [approvalTx, setApprovalTx] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('idle');
  const requestIdRef = useRef(0);

  const fromMarket = LIVE_MARKETS.find((market) => market.id === fromId) || LIVE_MARKETS[0];
  const toMarket = LIVE_MARKETS.find((market) => market.id === toId) || LIVE_MARKETS[1] || LIVE_MARKETS[0];
  const wrongNetwork = isConnected && chainId !== ARC_CHAIN_ID;

  const { data: inputDecimals } = useReadContract({ address: fromMarket?.address, abi: ERC20_ABI, functionName: 'decimals', query: { enabled: Boolean(fromMarket?.address) } });
  const { data: outputDecimals } = useReadContract({ address: toMarket?.address, abi: ERC20_ABI, functionName: 'decimals', query: { enabled: Boolean(toMarket?.address) } });
  const fromTokenDecimals = Number(inputDecimals ?? fromMarket?.decimals ?? 6);
  const toTokenDecimals = Number(outputDecimals ?? toMarket?.decimals ?? 6);

  const slippageBps = useMemo(() => {
    const parsed = Number(slippage);
    if (!Number.isFinite(parsed) || parsed < 0) return 50;
    return Math.min(5000, Math.round(parsed * 100));
  }, [slippage]);

  const amountRaw = useMemo(() => {
    if (!amount) return '';
    try { return parseUnits(amount, fromTokenDecimals).toString(); } catch { return ''; }
  }, [amount, fromTokenDecimals]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!amountRaw || !fromMarket?.address || !toMarket?.address || wrongNetwork) {
      setQuote(null); setPreparedTransactions(null); setApprovalTx(null); setError(''); setStage(wrongNetwork ? 'network' : 'idle');
      return undefined;
    }
    setQuote(null); setPreparedTransactions(null); setApprovalTx(null); setError(''); setNotice(''); setStage('quoting');
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/tower/swap/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputToken: fromMarket.address, outputToken: toMarket.address, inputAmount: amountRaw, slippageTolerance: slippageBps }) });
        const result = await response.json();
        if (requestId !== requestIdRef.current) return;
        if (!response.ok || !result.success) throw new Error(result.error || 'Tower could not find a route.');
        setQuote(result.data); setStage('quoted');
      } catch (caughtError) {
        if (requestId !== requestIdRef.current) return;
        setQuote(null); setPreparedTransactions(null); setError(errorText(caughtError)); setStage('idle');
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [amountRaw, fromMarket?.address, toMarket?.address, slippageBps, wrongNetwork]);

  useEffect(() => {
    if (!quote || !address || !isConnected || wrongNetwork) { setPreparedTransactions(null); return undefined; }
    const requestId = ++requestIdRef.current;
    setPreparedTransactions(null); setApprovalTx(null); setNotice(''); setError(''); setStage('preparing');
    const prepare = async () => {
      try {
        const response = await fetch('/api/tower/swap/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote, userAddress: address }) });
        const result = await response.json();
        if (requestId !== requestIdRef.current) return;
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to prepare the swap transaction.');
        setPreparedTransactions(result.data || {}); setStage('quoted');
      } catch (caughtError) {
        if (requestId !== requestIdRef.current) return;
        setPreparedTransactions(null); setError(errorText(caughtError)); setStage('quoted');
      }
    };
    prepare();
    return () => { requestIdRef.current += 1; };
  }, [quote, address, isConnected, wrongNetwork]);

  const invalidateQuote = () => { requestIdRef.current += 1; setQuote(null); setPreparedTransactions(null); setApprovalTx(null); setSwapTx(null); setNotice(''); setError(''); setStage(wrongNetwork ? 'network' : 'idle'); };
  const swapTokens = () => { const currentFrom = fromId; setFromId(toId); setToId(currentFrom); invalidateQuote(); };
  const changeFrom = (next) => { setFromId(next); if (next === toId) { const replacement = LIVE_MARKETS.find((market) => market.id !== next); if (replacement) setToId(replacement.id); } invalidateQuote(); };
  const changeTo = (next) => { setToId(next); invalidateQuote(); };

  const buildAndSwap = async () => {
    if (!quote || !address || !isConnected || wrongNetwork || walletPending) return;
    setNotice(''); setError('');
    try {
      let transactions = preparedTransactions;
      if (!transactions?.swap?.to || !transactions?.swap?.data) {
        setStage('building');
        const response = await fetch('/api/tower/swap/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote, userAddress: address }) });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Tower could not build the swap transaction.');
        transactions = result.data || {}; setPreparedTransactions(transactions);
      }
      if (!transactions.swap?.to || !transactions.swap?.data) throw new Error('Tower returned an incomplete swap transaction.');
      const approval = transactions.approval;
      if (approval && !approvalTx) {
        setNotice(`Approve ${fromMarket.symbol} first. After approval, press Swap to continue.`); setStage('approval');
        const hash = await sendTransactionAsync({ to: approval.to, data: approval.data, value: BigInt(approval.value || '0'), gas: approval.gasLimit ? BigInt(approval.gasLimit) : undefined, chainId: ARC_CHAIN_ID });
        setApprovalTx(hash); return;
      }
      setNotice('Approve the swap transaction in your wallet.'); setStage('swapping');
      const hash = await sendTransactionAsync({ to: transactions.swap.to, data: transactions.swap.data, value: BigInt(transactions.swap.value || '0'), gas: transactions.swap.gasLimit ? BigInt(transactions.swap.gasLimit) : undefined, chainId: ARC_CHAIN_ID });
      setSwapTx(hash); setStage('submitted'); setNotice('Swap transaction submitted.');
    } catch (caughtError) { setError(errorText(caughtError)); setStage('quoted'); }
  };

  const approvalReceipt = useWaitForTransactionReceipt({ hash: approvalTx || undefined, chainId: ARC_CHAIN_ID, query: { enabled: Boolean(approvalTx) } });
  const swapReceipt = useWaitForTransactionReceipt({ hash: swapTx || undefined, chainId: ARC_CHAIN_ID, query: { enabled: Boolean(swapTx) } });
  const approvalRequired = Boolean(preparedTransactions?.approval);
  const approvalComplete = !approvalRequired || approvalReceipt.isSuccess;
  const approvalPending = Boolean(approvalTx) && !approvalComplete;
  const isPreparing = walletPending || ['quoting', 'preparing', 'building'].includes(stage);
  const outputAmount = quote ? formatQuoteAmount(quote.outputAmount, toTokenDecimals) : '—';
  const minOutput = quote ? formatQuoteAmount(quote.minOut, toTokenDecimals) : '—';
  const priceImpactPercent = quote?.priceImpact != null ? safeNumber(quote.priceImpact) : null;
  const quoteReady = Boolean(quote?.outputAmount && quote?.minOut && BigInt(String(quote.minOut)) > 0n && BigInt(String(quote.outputAmount)) >= BigInt(String(quote.minOut)));

  useEffect(() => {
    if (approvalReceipt.isSuccess) { setNotice('Approval confirmed. Press Swap to complete the trade.'); setStage('quoted'); }
  }, [approvalReceipt.isSuccess]);

  return (
    <div className={styles.page}>
      <header className={styles.header}><div><span className={styles.kicker}>CENTRY · SWAP</span><h1>Swap assets</h1><p>Find a routed Arc swap without leaving Centry.</p></div><span className={styles.routePill}><i className={styles.routeDot} /> Tower routing</span></header>
      <div className={styles.panelGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span className={styles.kicker}>ARC SWAP</span><h2>Exchange</h2></div></div>
          {wrongNetwork ? <div className={`${styles.notice} ${styles.noticeError}`}><strong>Arc Testnet required.</strong> Switch your wallet network before requesting a quote or sending a swap.</div> : null}
          <div className={styles.swapStack}>
            <div className={styles.assetField}><label htmlFor="swap-amount">You pay</label><div className={styles.assetRow}><input id="swap-amount" className={styles.amountInput} type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => { const value = event.target.value; if (value === '' || /^\d*(\.\d*)?$/.test(value)) setAmount(value); }} /><TokenDropdown value={fromId} markets={LIVE_MARKETS} onChange={changeFrom} label="Input token" /></div></div>
            <button type="button" className={styles.switchButton} onClick={swapTokens} disabled={wrongNetwork || isPreparing || approvalPending} aria-label="Reverse swap">↕</button>
            <div className={styles.assetField}><label>Receive</label><div className={styles.assetRow}><div className={styles.amountInput}>{outputAmount}</div><TokenDropdown value={toId} markets={LIVE_MARKETS} onChange={changeTo} label="Output token" /></div></div>
          </div>
          <div className={styles.metaRow}><span>Slippage</span><input className={styles.slippageInput} value={slippage} onChange={(event) => setSlippage(event.target.value)} inputMode="decimal" aria-label="Slippage percentage" /><span>%</span></div>
          {quote ? <div className={styles.quoteCard}><div className={styles.quoteRow}><span>Expected output</span><strong className={styles.quoteOutput}>{outputAmount} {toMarket.symbol}</strong></div><div className={styles.quoteRow}><span>Minimum received</span><strong>{minOutput} {toMarket.symbol}</strong></div><div className={styles.quoteRow}><span>Price impact</span><strong>{formatPriceImpact(quote.priceImpact)}</strong></div>{priceImpactPercent != null && priceImpactPercent >= 5 ? <div className={`${styles.notice} ${styles.noticeError}`}>High price impact: {formatPriceImpact(priceImpactPercent)}. Consider a smaller trade or a different route.</div> : null}<div className={styles.quoteRow}><span>Route</span><strong>{typeof quote.route === 'string' ? quote.route : quote.dexName || quote.dexId || 'Tower routing'}</strong></div></div> : <div className={styles.quoteStatus}>{wrongNetwork ? 'Switch to Arc Testnet to quote this swap.' : stage === 'quoting' ? 'Fetching the best Arc route…' : stage === 'preparing' ? 'Preparing the transaction…' : 'Enter an amount to get a quote.'}</div>}
          {notice && <div className={styles.notice}>{notice}</div>}
          {error && <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>}
          {approvalReceipt.isLoading ? <div className={styles.notice}>Waiting for approval confirmation…</div> : null}
          {swapReceipt.isLoading ? <div className={styles.notice}>Waiting for swap confirmation…</div> : null}
          {swapReceipt.isSuccess ? <div className={`${styles.notice} ${styles.noticeSuccess}`}>Swap confirmed on Arc.</div> : null}
          {isConnected && !wrongNetwork && quoteReady ? <button type="button" className={styles.primaryButton} disabled={isPreparing || approvalPending || (!approvalComplete && !approvalRequired) || switchingNetwork || !preparedTransactions} onClick={buildAndSwap}>{walletPending ? 'Confirm in wallet…' : approvalPending ? 'Waiting for approval…' : approvalRequired && !approvalComplete ? `Approve ${fromMarket.symbol}` : approvalRequired && approvalComplete ? `Swap ${fromMarket.symbol} → ${toMarket.symbol}` : `Swap ${fromMarket.symbol} → ${toMarket.symbol}`}</button> : <button type="button" className={styles.secondaryButton} disabled>{wrongNetwork ? 'Switch to Arc Testnet' : !isConnected ? 'Connect wallet' : stage === 'quoting' ? 'Finding route…' : stage === 'preparing' ? 'Preparing swap…' : 'Enter an amount'}</button>}
        </section>

        <section className={`${styles.panel} ${styles.bridgeCard}`}>
          <div><span className={styles.kicker}>EXECUTION</span><h2>Trade details</h2></div>
          <p className={styles.bridgeDescription}>Tower selects the best available Arc route. CENT routes are handled by UnitFlow v2.5.</p>
          <div className={styles.quoteCard}>
            <div className={styles.bridgeRow}><span>Network</span><strong>Arc Testnet</strong></div>
            <div className={styles.bridgeRow}><span>Slippage tolerance</span><strong>{slippage}%</strong></div>
            <div className={styles.bridgeRow}><span>Price impact</span><strong>{quote ? formatPriceImpact(quote.priceImpact) : '—'}</strong></div>
            <div className={styles.bridgeRow}><span>Gas</span><strong>{quote?.gasEstimate ? `${quote.gasEstimate} units` : 'Calculated by wallet'}</strong></div>
          </div>
          {quote?.feeBps != null ? <div className={styles.quoteCard}><div className={styles.bridgeRow}><span>Liquidity fee</span><strong>{(Number(quote.feeBps) / 100).toFixed(2)}%</strong></div></div> : null}
        </section>
      </div>
    </div>
  );
}
