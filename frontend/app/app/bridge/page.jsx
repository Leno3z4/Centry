'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useConnectorClient, useSwitchChain } from 'wagmi';
import { decodeFunctionResult, encodeFunctionData, formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import styles from './bridge.module.css';

const ARC_CHAIN_ID = 5042002;
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';

const BRIDGE_CHAINS = [
  { id: 'arc-testnet', chainId: ARC_CHAIN_ID, domain: 26, name: 'Arc Testnet', short: 'Arc', badge: 'A', usdc: '0x3600000000000000000000000000000000000000', rpcUrl: 'https://rpc.testnet.arc.network', explorerUrl: 'https://testnet.arcscan.app', native: { name: 'USD Coin', symbol: 'USDC', decimals: 6 } },
  { id: 'base-sepolia', chainId: 84532, domain: 6, name: 'Base Sepolia', short: 'Base', badge: 'B', usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', rpcUrl: 'https://sepolia.base.org', explorerUrl: 'https://sepolia.basescan.org', native: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
  { id: 'arbitrum-sepolia', chainId: 421614, domain: 3, name: 'Arbitrum Sepolia', short: 'Arbitrum', badge: 'A', usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc', explorerUrl: 'https://sepolia.arbiscan.io', native: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
  { id: 'ethereum-sepolia', chainId: 11155111, domain: 0, name: 'Ethereum Sepolia', short: 'Ethereum', badge: 'E', usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', rpcUrl: 'https://rpc.sepolia.org', explorerUrl: 'https://sepolia.etherscan.io', native: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
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
  const { switchChain, isPending: switchingArc } = useSwitchChain();
  const [fromId, setFromId] = useState('arc-testnet');
  const [toId, setToId] = useState('base-sepolia');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [stage, setStage] = useState('idle');
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');

  const fromArc = fromId === 'arc-testnet';
  const toArc = toId === 'arc-testnet';
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
    setTxHash('');
    setError('');
    setStage('idle');
    if (address && walletChainId === source.chainId) void readBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, source.id, walletChainId]);

  const resetFlow = () => {
    setAmount('');
    setTxHash('');
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
    if (next === toId) setToId(next === 'arc-testnet' ? EXTERNAL_CHAINS[0].id : 'arc-testnet');
    resetFlow();
  };

  const changeTo = (next) => {
    setToId(next);
    if (next === fromId) setFromId(next === 'arc-testnet' ? EXTERNAL_CHAINS[0].id : 'arc-testnet');
    resetFlow();
  };

  const setMax = () => {
    if (balance && Number(balance) > 0) setAmount(balance);
  };

  const switchToSource = async () => {
    if (!isConnected || walletChainId === source.chainId) return true;
    setError('');
    try {
      if (source.chainId === ARC_CHAIN_ID) {
        await switchChain({ chainId: ARC_CHAIN_ID });
      } else {
        if (!connectorClient?.request) throw new Error('The connected wallet does not support network switching.');
        const chainHex = `0x${source.chainId.toString(16)}`;
        try {
          await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
        } catch (caughtError) {
          if (Number(caughtError?.code) !== 4902) throw caughtError;
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
      }
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
    if (!address || !validAmount || fromId === toId || !connectorClient?.request || stage === 'approval' || stage === 'bridging') return;
    setError('');
    setTxHash('');
    setStage('switching');
    try {
      if (!(await switchToSource())) return;

      const amountRaw = parseUnits(amount.trim(), 6);
      const mintRecipient = `0x${address.slice(2).padStart(64, '0')}`;
      const destinationCaller = `0x${'0'.repeat(64)}`;
      const finalityThreshold = 2000;
      let maxFee = 1000n;

      try {
        const feeData = encodeFunctionData({ abi: TOKEN_MESSENGER_V2_ABI, functionName: 'getMinFeeAmount', args: [destination.domain, mintRecipient, destinationCaller, finalityThreshold, '0x'] });
        const feeRaw = await connectorClient.request({ method: 'eth_call', params: [{ to: TOKEN_MESSENGER_V2, data: feeData }, 'latest'] });
        maxFee = (BigInt(decodeFunctionResult({ abi: TOKEN_MESSENGER_V2_ABI, functionName: 'getMinFeeAmount', data: feeRaw })) * 120n / 100n) + 1n;
      } catch {
        // Standard-transfer fees are normally zero; retain a small testnet safety ceiling if the optional fee read is unavailable.
      }

      await approveIfNeeded(amountRaw);

      setStage('bridging');
      const bridgeData = encodeFunctionData({
        abi: TOKEN_MESSENGER_V2_ABI,
        functionName: 'depositForBurn',
        args: [amountRaw, destination.domain, mintRecipient, source.usdc, destinationCaller, maxFee, finalityThreshold],
      });
      const hash = await requestWalletTransaction({ to: TOKEN_MESSENGER_V2, data: bridgeData });
      setTxHash(hash);
      const receipt = await waitForReceipt(connectorClient, hash);
      if (receipt.status === '0x0') throw new Error('The bridge transaction was reverted on the source chain.');
      setStage('submitted');
    } catch (caughtError) {
      setError(errorText(caughtError));
      setStage('idle');
    }
  };

  const buttonLabel = !isConnected
    ? 'Connect wallet'
    : stage === 'switching' || switchingArc
      ? `Switching to ${source.short}…`
      : stage === 'approval'
        ? 'Approve USDC in wallet…'
        : stage === 'bridging'
          ? 'Confirm bridge in wallet…'
          : stage === 'submitted'
            ? 'Bridge submitted'
            : !walletOnSource
              ? `Switch to ${source.short} & bridge`
              : `Bridge USDC to ${destination.short}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.kicker}>CENTRY · BRIDGE</span><h1>Move USDC across chains</h1><p>Bridge testnet USDC with Circle CCTP. Your wallet signs every source-chain transaction.</p></div>
        <span className={styles.destinationPill}><i /> Circle CCTP · USDC</span>
      </header>

      <section className={styles.card}>
        <div className={styles.fieldBlock}><label>From</label><ChainPicker value={fromId} chains={sourceChains} onChange={changeFrom} label="Source chain" /></div>
        <button type="button" className={styles.arrowButton} onClick={switchDirection} disabled={stage === 'approval' || stage === 'bridging'} aria-label="Switch bridge direction" title="Switch bridge direction">⇅</button>
        <div className={styles.fieldBlock}><label>To</label><ChainPicker value={toId} chains={destinationChains} onChange={changeTo} label="Destination chain" /></div>

        <div className={styles.amountBlock}>
          <div className={styles.amountHeader}><label>Amount</label><button type="button" className={styles.balanceButton} onClick={setMax} disabled={!balance || Number(balance) <= 0}>Max {balance ? `${balance} USDC` : ''}</button></div>
          <div className={styles.amountField}><input type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => { const value = event.target.value; if (value === '' || /^\d*(\.\d{0,6})?$/.test(value)) setAmount(value); }} /><span>USDC</span></div>
        </div>

        <div className={styles.summary}>
          <div><span>From</span><strong>{source.name}</strong></div>
          <div><span>To</span><strong>{destination.name}</strong></div>
          <div><span>Route</span><strong>Circle CCTP</strong></div>
          <div><span>Transfer type</span><strong>1:1 USDC</strong></div>
          <div><span>Recipient</span><strong>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect wallet'}</strong></div>
        </div>

        {!walletOnSource && isConnected ? <div className={styles.notice}>Wallet is on chain {walletChainId}. Switch to {source.name} before starting this bridge.</div> : null}
        {stage === 'approval' ? <div className={styles.notice}>Approve USDC in your wallet. The bridge will continue automatically after the approval confirms.</div> : null}
        {stage === 'bridging' ? <div className={styles.notice}>Confirm the bridge transaction in your wallet. Your USDC stays in your wallet until you approve the transaction.</div> : null}

        <button type="button" className={styles.primaryButton} disabled={!isConnected || !validAmount || fromId === toId || stage === 'approval' || stage === 'bridging' || stage === 'submitted' || switchingArc} onClick={bridge}>{buttonLabel}</button>
        {isConnected && <button type="button" className={styles.refreshButton} onClick={readBalance} disabled={loadingBalance}>{loadingBalance ? 'Checking balance…' : `Refresh ${source.short} USDC balance`}</button>}
        {error && <div className={`${styles.notice} ${styles.noticeError}`} role="alert">{error}</div>}
        {stage === 'submitted' && txHash ? <div className={`${styles.notice} ${styles.noticeSuccess}`}><strong>Bridge transaction submitted.</strong><span>The source-chain burn was confirmed. Circle can now attest the transfer for destination minting.</span><code>{txHash}</code></div> : null}
      </section>

      <p className={styles.disclaimer}>Bridge support is currently limited to USDC and the supported testnet networks shown above.</p>
    </div>
  );
}
