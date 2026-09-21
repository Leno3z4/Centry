'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useConnectorClient } from 'wagmi';
import { encodeFunctionData, formatUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import styles from './bridge.module.css';

const ARC_CHAIN_ID = 5042;
const TOWER_BRIDGE_ENDPOINT = '/api/tower/bridge';
const BRIDGE_CHAINS = [
  { id: 'arc-mainnet', chainId: ARC_CHAIN_ID, name: 'Arc Mainnet', short: 'Arc', badge: 'A', usdc: '0x3600000000000000000000000000000000000000', rpcUrl: 'https://rpc.mainnet.arc.io', explorerUrl: 'https://explorer.arc.io', native: { name: 'USDC', symbol: 'USDC', decimals: 18 } },
  { id: 'base-mainnet', chainId: 8453, name: 'Base', short: 'Base', badge: 'B', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', rpcUrl: 'https://mainnet.base.org', explorerUrl: 'https://basescan.org', native: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
  { id: 'arbitrum-mainnet', chainId: 42161, name: 'Arbitrum', short: 'Arbitrum', badge: 'A', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', rpcUrl: 'https://arb1.arbitrum.io/rpc', explorerUrl: 'https://arbiscan.io', native: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
  { id: 'ethereum-mainnet', chainId: 1, name: 'Ethereum', short: 'Ethereum', badge: 'E', usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', rpcUrl: 'https://ethereum-rpc.publicnode.com', explorerUrl: 'https://etherscan.io', native: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
];

const EXTERNAL_CHAINS = BRIDGE_CHAINS.filter((chain) => chain.chainId !== ARC_CHAIN_ID);

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
];


function ChainPicker({ value, chains, onChange, label }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = chains.find((chain) => chain.id === value) || chains[0];

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div className={`${styles.chainPicker} ${open ? styles.chainPickerOpen : ''}`} ref={rootRef}>
      <button type="button" className={`${styles.chainTrigger} ${open ? styles.chainTriggerOpen : ''}`} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="listbox" aria-label={label}>
        <span className={styles.chainBadge}>{selected.badge}</span>
        <span className={styles.chainText}><strong>{selected.name}</strong><small>USDC</small></span>
        <span className={styles.chevron}>{open ? '⌃' : '⌄'}</span>
      </button>
      {open && <div className={styles.chainMenu} role="listbox" aria-label={label}>
        {chains.map((chain) => <button key={chain.id} type="button" role="option" aria-selected={chain.id === selected.id} className={`${styles.chainOption} ${chain.id === selected.id ? styles.chainOptionActive : ''}`} onClick={() => { onChange(chain.id); setOpen(false); }}>
          <span className={styles.chainBadge}>{chain.badge}</span>
          <span className={styles.chainText}><strong>{chain.name}</strong><small>USDC</small></span>
          {chain.id === selected.id && <span className={styles.check}>✓</span>}
        </button>)}
      </div>}
    </div>
  );
}

function errorText(error) {
  return error?.shortMessage || error?.message || 'The bridge transaction could not be completed.';
}

export default function Page() {
  return <Providers><AppShell><BridgeContent /></AppShell></Providers>;
}

function BridgeContent() {
  const { address, isConnected } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const [fromId, setFromId] = useState('arc-mainnet');
  const [toId, setToId] = useState('base-mainnet');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [stage, setStage] = useState('idle');
  const [bridgeResult, setBridgeResult] = useState(null);
  const [error, setError] = useState('');

  const fromArc = fromId === 'arc-mainnet';
  const toArc = toId === 'arc-mainnet';
  const sourceChains = useMemo(() => toArc ? EXTERNAL_CHAINS : [BRIDGE_CHAINS[0]], [toArc]);
  const destinationChains = useMemo(() => fromArc ? EXTERNAL_CHAINS : [BRIDGE_CHAINS[0]], [fromArc]);
  const source = BRIDGE_CHAINS.find((chain) => chain.id === fromId) || BRIDGE_CHAINS[0];
  const destination = BRIDGE_CHAINS.find((chain) => chain.id === toId) || BRIDGE_CHAINS[1];
  const validAmount = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0;

  const readBalance = async () => {
    if (!connectorClient?.request || !address || !source) return;
    setLoadingBalance(true);
    setError('');
    try {
      const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [address] });
      const raw = await connectorClient.request({ method: 'eth_call', params: [{ to: source.usdc, data }, 'latest'] });
      setBalance(formatUnits(BigInt(raw), 6));
    } catch (caughtError) {
      setBalance(null);
      setError(errorText(caughtError));
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    setAmount('');
    setError('');
    setStage('idle');
    if (address && walletChainId === source.chainId) void readBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, source.id, walletChainId]);

  const resetFlow = () => {
    setAmount('');
    setError('');
    setBridgeResult(null);
    setStage('idle');
  };

  const switchDirection = () => {
    setFromId(toId);
    setToId(fromId);
    resetFlow();
  };

  const changeFrom = (next) => {
    setFromId(next);
    if (next === toId) setToId(next === 'arc-mainnet' ? EXTERNAL_CHAINS[0].id : 'arc-mainnet');
    resetFlow();
  };

  const changeTo = (next) => {
    setToId(next);
    if (next === fromId) setFromId(next === 'arc-mainnet' ? EXTERNAL_CHAINS[0].id : 'arc-mainnet');
    resetFlow();
  };

  const setMax = () => {
    if (balance && Number(balance) > 0) setAmount(balance);
  };

  const bridge = async () => {
    if (!address || !validAmount || fromId === toId || stage === 'submitting') return;
    setError('');
    setBridgeResult(null);
    setStage('submitting');

    try {
      const response = await fetch(TOWER_BRIDGE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromChainId: source.chainId,
          toChainId: destination.chainId,
          amount: amount.trim(),
          token: 'USDC',
          recipientAddress: address,
          senderAddress: address,
          useForwarder: true,
        }),
      });
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { throw new Error('Tower returned an invalid bridge response.'); }
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Tower could not start the bridge.');
      }

      const transactionHash =
        result.transactionHash
        || result.txHash
        || result.data?.transactionHash
        || result.data?.txHash
        || null;

      if (!transactionHash) {
        throw new Error('Tower accepted the bridge request but did not return the source transaction hash. No wallet transaction was submitted.');
      }

      setBridgeResult({ ...result, transactionHash });
      setAmount('');
      setStage('pending');
      setError('');
      void readBalance();
    } catch (caughtError) {
      setError(errorText(caughtError));
      setStage('idle');
    }
  };

  const buttonLabel = !isConnected
    ? 'Connect wallet'
    : stage === 'submitting'
      ? 'Starting bridge…'
      : stage === 'pending'
        ? 'Bridge submitted'
        : `Bridge USDC to ${destination.short}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.kicker}>CENTRY · BRIDGE</span><h1>Move USDC across chains</h1><p>Tower handles the bridge request. Centry marks the bridge submitted only when Tower returns the source transaction hash.</p></div>
        <span className={styles.destinationPill}><i /> Tower Bridge</span>
      </header>

      <section className={styles.card}>
        <div className={styles.fieldBlock}><label>From</label><ChainPicker value={fromId} chains={sourceChains} onChange={changeFrom} label="Source chain" /></div>
        <button type="button" className={styles.arrowButton} onClick={switchDirection} disabled={stage === 'switching' || stage === 'submitting'} aria-label="Switch bridge direction" title="Switch bridge direction">⇅</button>
        <div className={styles.fieldBlock}><label>To</label><ChainPicker value={toId} chains={destinationChains} onChange={changeTo} label="Destination chain" /></div>

        <div className={styles.amountBlock}>
          <div className={styles.amountHeader}><label>Amount</label><button type="button" className={styles.balanceButton} onClick={setMax} disabled={!balance || Number(balance) <= 0}>Max {balance ? `${balance} USDC` : ''}</button></div>
          <div className={styles.amountField}><input type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => { const value = event.target.value; if (value === '' || /^\d*(\.\d{0,6})?$/.test(value)) setAmount(value); }} /><span>USDC</span></div>
        </div>

        <div className={styles.summary}>
          <div><span>From</span><strong>{source.name}</strong></div>
          <div><span>To</span><strong>{destination.name}</strong></div>
          <div><span>Route</span><strong>Tower</strong></div>
          <div><span>Transfer type</span><strong>1:1 USDC</strong></div>
          <div><span>Recipient</span><strong>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect wallet'}</strong></div>
        </div>

        {stage === 'submitting' ? <div className={styles.notice}>Submitting the bridge request to Tower…</div> : null}

        {stage !== 'pending' && isConnected && <button type="button" className={styles.refreshButton} onClick={readBalance} disabled={loadingBalance}>{loadingBalance ? 'Checking balance…' : `Refresh ${source.short} USDC balance`}</button>}
        {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert">{error}</div>}
        {stage === 'pending' && bridgeResult ? (
          <div className={`${styles.notice} ${styles.noticeSuccess}`}>
            <strong>Bridge accepted by Tower.</strong>
            <span>Status: {bridgeResult.status || 'pending'}{bridgeResult.estimatedTime ? ` · Estimated time: ${bridgeResult.estimatedTime}` : ''}</span>
            {bridgeResult.transactionHash ? <a href={`${source.explorerUrl}/tx/${bridgeResult.transactionHash}`} target="_blank" rel="noreferrer">View source transaction ↗</a> : <span>Tower did not expose the source transaction hash.</span>}
            <button type="button" className={styles.refreshButton} onClick={resetFlow}>Start another bridge</button>
          </div>
        ) : null}
      </section>

      <p className={styles.disclaimer}>Bridge support is currently limited to USDC and the supported mainnet networks shown above.</p>
    </div>
  );
}
