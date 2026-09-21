'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useConnectorClient } from 'wagmi';
import { decodeFunctionResult, encodeFunctionData, formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import styles from './bridge.module.css';

const ARC_CHAIN_ID = 5042;
const TOKEN_MESSENGER_V2 = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d';

const BRIDGE_CHAINS = [
  { id: 'arc-mainnet', chainId: ARC_CHAIN_ID, domain: 26, name: 'Arc Mainnet', short: 'Arc', badge: 'A', usdc: '0x3600000000000000000000000000000000000000', rpcUrl: 'https://rpc.mainnet.arc.io', explorerUrl: 'https://explorer.arc.io', native: { name: 'USDC', symbol: 'USDC', decimals: 18 } },
  { id: 'base-mainnet', chainId: 8453, domain: 6, name: 'Base', short: 'Base', badge: 'B', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', rpcUrl: 'https://mainnet.base.org', explorerUrl: 'https://basescan.org', native: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
  { id: 'arbitrum-mainnet', chainId: 42161, domain: 3, name: 'Arbitrum', short: 'Arbitrum', badge: 'A', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', rpcUrl: 'https://arb1.arbitrum.io/rpc', explorerUrl: 'https://arbiscan.io', native: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
  { id: 'ethereum-mainnet', chainId: 1, domain: 0, name: 'Ethereum', short: 'Ethereum', badge: 'E', usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', rpcUrl: 'https://ethereum-rpc.publicnode.com', explorerUrl: 'https://etherscan.io', native: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
];

const EXTERNAL_CHAINS = BRIDGE_CHAINS.filter((chain) => chain.chainId !== ARC_CHAIN_ID);

const ERC20_ABI = [
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const TOKEN_MESSENGER_V2_ABI = [
  { type: 'function', name: 'depositForBurn', stateMutability: 'nonpayable', inputs: [
    { name: 'amount', type: 'uint256' },
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'mintRecipient', type: 'bytes32' },
    { name: 'burnToken', type: 'address' },
    { name: 'destinationCaller', type: 'bytes32' },
    { name: 'maxFee', type: 'uint256' },
    { name: 'minFinalityThreshold', type: 'uint32' },
  ], outputs: [] },
  { type: 'function', name: 'getMinFeeAmount', stateMutability: 'view', inputs: [
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'recipient', type: 'bytes32' },
    { name: 'destinationCaller', type: 'bytes32' },
    { name: 'minFinalityThreshold', type: 'uint32' },
    { name: 'messageBody', type: 'bytes' },
  ], outputs: [{ type: 'uint256' }] },
];

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function waitForReceipt(provider, hash, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (receipt) return receipt;
    await sleep(1500);
  }
  throw new Error('Timed out waiting for the wallet transaction to confirm.');
}

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
  const walletChainId = useChainId();
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
  const walletOnSource = !isConnected || walletChainId === source.chainId;
  const validAmount = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0;

  const readBalance = async () => {
    if (!connectorClient?.request || !address || !source) return;
    setLoadingBalance(true);
    setError('');
    try {
      const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [address] });
      const raw = await connectorClient.request({ method: 'eth_call', params: [{ to: source.usdc, data }, 'latest'] });
      const decoded = decodeFunctionResult({ abi: ERC20_ABI, functionName: 'balanceOf', data: raw });
      setBalance(formatUnits(decoded, 6));
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

  const waitForChain = async (targetChainId) => {
    if (!connectorClient?.request) throw new Error('The connected wallet does not expose a network provider.');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const current = await connectorClient.request({ method: 'eth_chainId' });
      if (Number(BigInt(current)) === targetChainId) return;
      await sleep(250);
    }
    throw new Error(`Wallet did not switch to ${BRIDGE_CHAINS.find((chain) => chain.chainId === targetChainId)?.name || 'the selected source chain'}.`);
  };

  const switchToSource = async () => {
    if (!isConnected || walletChainId === source.chainId) return true;
    if (!connectorClient?.request) {
      setError('The connected wallet does not expose a network switch provider.');
      return false;
    }
    setError('');
    try {
      const chainHex = `0x${source.chainId.toString(16)}`;
      try {
        await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
      } catch (caughtError) {
        const code = Number(caughtError?.code);
        if (code !== 4902 && code !== -32603 && code !== -32602) throw caughtError;
        await connectorClient.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainHex,
            chainName: source.name,
            nativeCurrency: source.native,
            rpcUrls: [source.rpcUrl],
            blockExplorerUrls: [source.explorerUrl],
          }],
        });
        await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
      }
      await waitForChain(source.chainId);
      return true;
    } catch (caughtError) {
      setError(errorText(caughtError));
      return false;
    }
  };

  const requestWalletTransaction = async ({ to, data }) => {
    if (!connectorClient?.request || !address) throw new Error('Wallet connection is unavailable.');
    return connectorClient.request({ method: 'eth_sendTransaction', params: [{ from: address, to, data, value: '0x0' }] });
  };

  const approveIfNeeded = async (amountRaw) => {
    const allowanceData = encodeFunctionData({ abi: ERC20_ABI, functionName: 'allowance', args: [address, TOKEN_MESSENGER_V2] });
    const allowanceRaw = await connectorClient.request({ method: 'eth_call', params: [{ to: source.usdc, data: allowanceData }, 'latest'] });
    const allowance = BigInt(allowanceRaw);
    if (allowance >= amountRaw) return;

    setStage('approval');
    const approvalData = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [TOKEN_MESSENGER_V2, amountRaw] });
    const approvalHash = await requestWalletTransaction({ to: source.usdc, data: approvalData });
    setTxHash(approvalHash);
    const receipt = await waitForReceipt(connectorClient, approvalHash);
    if (receipt.status === '0x0') throw new Error('USDC approval was reverted on the source chain.');
  };

  const bridge = async () => {
    if (!address || !validAmount || fromId === toId || submitted || stage === 'submitting') return;
    setError('');
    setBridgeResult(null);
    setStage('switching');

    try {
      if (isConnected && walletChainId !== source.chainId) await switchToSource();

      setStage('submitting');
      const response = await fetch('/api/tower/bridge', {
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
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Tower could not start the bridge.');
      setBridgeResult(result);
      setAmount('');
      setStage('pending');
      void readBalance();
    } catch (caughtError) {
      setError(errorText(caughtError));
      setStage('idle');
    }
  };

  const buttonLabel = !isConnected
    ? 'Connect wallet'
    : stage === 'switching'
      ? `Switching to ${source.short}…`
      : stage === 'submitting'
        ? 'Starting bridge…'
        : stage === 'pending'
          ? 'Bridge submitted'
          : `Bridge USDC to ${destination.short}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.kicker}>CENTRY · BRIDGE</span><h1>Move USDC across chains</h1><p>Tower handles the cross-chain USDC route while Centry tracks the bridge status.</p></div>
        <span className={styles.destinationPill}><i /> Tower Bridge</span>
      </header>

      <section className={styles.card}>
        <div className={styles.fieldBlock}><label>From</label><ChainPicker value={fromId} chains={sourceChains} onChange={changeFrom} label="Source chain" /></div>
        <button type="button" className={styles.arrowButton} onClick={switchDirection} disabled={stage === 'switching' || stage === 'submitting' || submitted} aria-label="Switch bridge direction" title="Switch bridge direction">⇅</button>
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

        {stage !== 'pending' && !walletOnSource && isConnected ? <div className={styles.notice}>Wallet is on chain {walletChainId}. Centry will switch to {source.name} before starting the Tower bridge.</div> : null}
        {stage === 'submitting' ? <div className={styles.notice}>Submitting the bridge request to Tower…</div> : null}

        <button type="button" className={styles.primaryButton} disabled={!isConnected || !validAmount || fromId === toId || stage === 'switching' || stage === 'submitting' || submitted} onClick={bridge}>{buttonLabel}</button>
        {stage !== 'pending' && isConnected && <button type="button" className={styles.refreshButton} onClick={readBalance} disabled={loadingBalance}>{loadingBalance ? 'Checking balance…' : `Refresh ${source.short} USDC balance`}</button>}
        {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert">{error}</div>}
        {stage === 'pending' && bridgeResult ? (
          <div className={`${styles.notice} ${styles.noticeSuccess}`}>
            <strong>Bridge submitted through Tower.</strong>
            <span>Status: {bridgeResult.status || 'pending'}{bridgeResult.estimatedTime ? ` · Estimated time: ${bridgeResult.estimatedTime}` : ''}</span>
            {bridgeResult.transactionHash ? <a href={`${source.explorerUrl}/tx/${bridgeResult.transactionHash}`} target="_blank" rel="noreferrer">View source transaction ↗</a> : null}
            <button type="button" className={styles.refreshButton} onClick={resetFlow}>Start another bridge</button>
          </div>
        ) : null}
      </section>

      <p className={styles.disclaimer}>Bridge support is currently limited to USDC and the supported mainnet networks shown above.</p>
    </div>
  );
}
