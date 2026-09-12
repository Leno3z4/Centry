'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, useConnectorClient } from 'wagmi';
import { decodeFunctionResult, encodeFunctionData, formatUnits, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import {
  ERC20_ALLOWANCE_ABI,
  GATEWAY_TESTNET_CHAINS,
  GATEWAY_WALLET_ABI,
  GATEWAY_WALLET_ADDRESS,
} from '../../../constants/circleGateway';
import styles from './gateway.module.css';

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function errorText(error) {
  return error?.shortMessage || error?.message || 'The Gateway transaction could not be completed.';
}

async function waitForReceipt(provider, hash, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (receipt) return receipt;
    await sleep(1500);
  }
  throw new Error('Timed out waiting for the wallet transaction to confirm.');
}

function chainLabel(chainId) {
  return GATEWAY_TESTNET_CHAINS.find((chain) => chain.chainId === chainId)?.name || `Chain ${chainId}`;
}

export default function Page() {
  return <Providers><AppShell><GatewayContent /></AppShell></Providers>;
}

function GatewayContent() {
  const { address, isConnected, connector } = useAccount();
  const walletChainId = useChainId();
  const { data: connectorClient } = useConnectorClient();
  const [sourceId, setSourceId] = useState('arc-testnet');
  const [amount, setAmount] = useState('');
  const [walletBalance, setWalletBalance] = useState(null);
  const [gatewayBalances, setGatewayBalances] = useState([]);
  const [gatewayTotal, setGatewayTotal] = useState('0.000000');
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [stage, setStage] = useState('idle');
  const [txHash, setTxHash] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const source = useMemo(
    () => GATEWAY_TESTNET_CHAINS.find((chain) => chain.id === sourceId) || GATEWAY_TESTNET_CHAINS[0],
    [sourceId],
  );
  const onSource = isConnected && walletChainId === source.chainId;
  const validAmount = /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0;

  const request = useCallback(async (method, params = []) => {
    if (!connectorClient?.request) throw new Error('The connected wallet does not expose a provider.');
    return connectorClient.request({ method, params });
  }, [connectorClient]);

  const refreshGatewayBalances = useCallback(async () => {
    if (!address) {
      setGatewayBalances([]);
      setGatewayTotal('0.000000');
      return;
    }
    setLoadingBalances(true);
    try {
      const response = await fetch('/api/circle/gateway/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositor: address }),
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to read Gateway balances.');
      setGatewayBalances(Array.isArray(result.balances) ? result.balances : []);
      setGatewayTotal(result.total || '0.000000');
    } catch (caughtError) {
      setError(errorText(caughtError));
    } finally {
      setLoadingBalances(false);
    }
  }, [address]);

  const refreshWalletBalance = useCallback(async () => {
    if (!address || !onSource) {
      setWalletBalance(null);
      return;
    }
    try {
      const balanceData = encodeFunctionData({ abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [address] });
      const raw = await request('eth_call', [{ to: source.usdc, data: balanceData }, 'latest']);
      const decoded = decodeFunctionResult({ abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', data: raw });
      setWalletBalance(formatUnits(decoded, 6));
    } catch (caughtError) {
      setWalletBalance(null);
      setError(errorText(caughtError));
    }
  }, [address, onSource, request, source.usdc]);

  useEffect(() => {
    void refreshGatewayBalances();
  }, [refreshGatewayBalances]);

  useEffect(() => {
    void refreshWalletBalance();
  }, [refreshWalletBalance]);

  const switchToSource = async () => {
    if (!connectorClient?.request || !isConnected) throw new Error('Connect a wallet first.');
    if (walletChainId === source.chainId) return;

    setStage('switching');
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
          nativeCurrency: source.nativeCurrency,
          rpcUrls: [source.rpcUrl],
          blockExplorerUrls: [source.explorerUrl],
        }],
      });
      await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const current = await connectorClient.request({ method: 'eth_chainId' });
      if (Number(BigInt(current)) === source.chainId) return;
      await sleep(250);
    }

    throw new Error(`Wallet did not switch to ${source.name}.`);
  };

  const sendTransaction = async (to, data) => {
    if (!address) throw new Error('Wallet connection is unavailable.');
    return request('eth_sendTransaction', [{ from: address, to, data, value: '0x0' }]);
  };

  const deposit = async () => {
    if (!isConnected || !address || !validAmount || !connectorClient?.request || stage === 'approval' || stage === 'deposit') return;
    setError('');
    setNotice('');
    setTxHash('');

    try {
      if (walletChainId !== source.chainId) {
        await switchToSource();
      }

      const amountRaw = parseUnits(amount.trim(), 6);
      const allowanceData = encodeFunctionData({ abi: ERC20_ALLOWANCE_ABI, functionName: 'allowance', args: [address, GATEWAY_WALLET_ADDRESS] });
      const allowanceRaw = await request('eth_call', [{ to: source.usdc, data: allowanceData }, 'latest']);
      const allowance = BigInt(allowanceRaw);

      if (allowance < amountRaw) {
        setStage('approval');
        setNotice(`Approve USDC for Circle Gateway on ${source.name}.`);
        const approvalData = encodeFunctionData({ abi: ERC20_ALLOWANCE_ABI, functionName: 'approve', args: [GATEWAY_WALLET_ADDRESS, amountRaw] });
        const approvalHash = await sendTransaction(source.usdc, approvalData);
        setTxHash(approvalHash);
        const approvalReceipt = await waitForReceipt(connectorClient, approvalHash);
        if (approvalReceipt.status === '0x0') throw new Error('USDC approval was reverted.');
      }

      setStage('deposit');
      setNotice(`Deposit ${amount.trim()} USDC into Circle Gateway on ${source.name}.`);
      const depositData = encodeFunctionData({ abi: GATEWAY_WALLET_ABI, functionName: 'deposit', args: [source.usdc, amountRaw] });
      const depositHash = await sendTransaction(GATEWAY_WALLET_ADDRESS, depositData);
      setTxHash(depositHash);
      const receipt = await waitForReceipt(connectorClient, depositHash);
      if (receipt.status === '0x0') throw new Error('Gateway deposit was reverted.');

      setStage('submitted');
      setNotice('Deposit confirmed. Gateway will make the balance available after source-chain finalization and processing.');
      setAmount('');
      await refreshGatewayBalances();
      await refreshWalletBalance();
    } catch (caughtError) {
      setError(errorText(caughtError));
      setStage('idle');
    }
  };

  const buttonLabel = !isConnected
    ? 'Connect wallet'
    : stage === 'switching'
      ? `Switching to ${source.short}…`
      : stage === 'approval'
        ? 'Approve USDC in wallet…'
        : stage === 'deposit'
          ? 'Confirm Gateway deposit…'
          : stage === 'submitted'
            ? 'Deposit confirmed'
            : !onSource
              ? `Switch to ${source.short} & deposit`
              : 'Deposit USDC';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CENTRY · CIRCLE GATEWAY</span>
          <h1>Unified USDC</h1>
          <p>Deposit USDC into Circle Gateway and make finalized liquidity available as one cross-chain balance.</p>
        </div>
        <span className={styles.statusPill}><i /> Arc Testnet</span>
      </header>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div><span className={styles.kicker}>TESTNET</span><h2>Deposit USDC</h2></div>
            <span className={styles.contractTag}>Gateway Wallet</span>
          </div>

          <label className={styles.fieldLabel}>Source chain</label>
          <select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setError(''); setNotice(''); setStage('idle'); }}>
            {GATEWAY_TESTNET_CHAINS.map((chain) => <option key={chain.id} value={chain.id}>{chain.name}</option>)}
          </select>

          <label className={styles.fieldLabel}>Amount</label>
          <div className={styles.amountField}>
            <input type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => { const value = event.target.value; if (value === '' || /^\d*(\.\d{0,6})?$/.test(value)) setAmount(value); }} />
            <span>USDC</span>
          </div>
          <div className={styles.metaRow}>
            <span>Wallet balance</span>
            <strong>{onSource && walletBalance != null ? `${Number(walletBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC` : onSource ? 'Loading…' : `Switch to ${source.short}`}</strong>
          </div>

          {!onSource && isConnected ? <div className={styles.notice}>Wallet is on {chainLabel(walletChainId)}. Gateway deposits must be submitted from the selected source chain.</div> : null}
          {notice ? <div className={`${styles.notice} ${stage === 'submitted' ? styles.noticeSuccess : ''}`}>{notice}</div> : null}
          {error ? <div className={`${styles.notice} ${styles.noticeError}`} role="alert">{error}</div> : null}

          <button type="button" className={styles.primaryButton} disabled={!isConnected || !validAmount || stage === 'approval' || stage === 'deposit' || stage === 'submitted'} onClick={deposit}>{buttonLabel}</button>
          <p className={styles.helper}>Gateway deposits must use the contract's deposit method. Direct ERC-20 transfers to the Gateway Wallet are not valid deposits.</p>
          {txHash ? <a className={styles.txLink} href={`${source.explorerUrl}/tx/${txHash}`} target="_blank" rel="noreferrer">View latest transaction ↗</a> : null}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div><span className={styles.kicker}>CIRCLE GATEWAY</span><h2>Unified balance</h2></div>
            <button type="button" className={styles.refreshButton} onClick={refreshGatewayBalances} disabled={loadingBalances}>{loadingBalances ? 'Refreshing…' : 'Refresh'}</button>
          </div>

          <div className={styles.totalCard}>
            <span>Total available</span>
            <strong>{Number(gatewayTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC</strong>
            <small>Across finalized Gateway deposits</small>
          </div>

          <div className={styles.balanceList}>
            {gatewayBalances.map((chain) => (
              <div className={styles.balanceRow} key={chain.id}>
                <div><strong>{chain.name}</strong><small>Domain {chain.domain}</small></div>
                <strong>{Number(chain.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC</strong>
              </div>
            ))}
          </div>

          <div className={styles.infoBox}>
            <strong>What happens next?</strong>
            <span>Your deposit is finalized on its source chain, then Circle Gateway credits the corresponding unified balance. That balance can later be transferred to another supported chain through Gateway.</span>
          </div>
        </section>
      </div>

      <p className={styles.disclaimer}>Centry's existing CCTP bridge remains unchanged. This Gateway page is an isolated testnet integration for unified USDC liquidity.</p>
    </div>
  );
}
