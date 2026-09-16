'use client';

import { useMemo, useState } from 'react';
import { useAccount, useConnectorClient } from 'wagmi';
import { encodeFunctionData, parseUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { ERC20_ABI } from '../constants/abis';
import { describeAgentAction, validateAgentPlan, buildAgentWalletRequest, AGENT_ACTIONS } from '../lib/agentExecution';
import { useGatewayFunding } from '../hooks/useGatewayFunding';
import styles from './CentryExecutionPanel.module.css';

const ARC_CHAIN_ID = 5042002;
const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const TOKEN_MESSENGER_ABI = [{ type: 'function', name: 'depositForBurn', stateMutability: 'nonpayable', inputs: [
  { name: 'amount', type: 'uint256' }, { name: 'destinationDomain', type: 'uint32' }, { name: 'mintRecipient', type: 'bytes32' }, { name: 'burnToken', type: 'address' }, { name: 'destinationCaller', type: 'bytes32' }, { name: 'maxFee', type: 'uint256' }, { name: 'minFinalityThreshold', type: 'uint32' },
], outputs: [] }];
const BRIDGE_CHAINS = {
  arc: { chainId: 5042002, domain: 26, usdc: '0x3600000000000000000000000000000000000000', name: 'Arc Testnet', rpcUrl: 'https://rpc.testnet.arc.network', explorerUrl: 'https://testnet.arcscan.app' },
  base: { chainId: 84532, domain: 6, usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', name: 'Base Sepolia', rpcUrl: 'https://sepolia.base.org', explorerUrl: 'https://sepolia.basescan.org' },
  arbitrum: { chainId: 421614, domain: 3, usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', name: 'Arbitrum Sepolia', rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc', explorerUrl: 'https://sepolia.arbiscan.io' },
  ethereum: { chainId: 11155111, domain: 0, usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', name: 'Ethereum Sepolia', rpcUrl: 'https://rpc.sepolia.org', explorerUrl: 'https://sepolia.etherscan.io' },
};
const REWARDS_ABI = [{ type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [
  { name: 'epoch', type: 'uint256' }, { name: 'tokenId', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'proof', type: 'bytes32[]' },
], outputs: [{ type: 'uint256' }] }];
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
function padAddress(address) { return `0x${String(address).slice(2).padStart(64, '0')}`; }

export default function CentryExecutionPanel({ plan, onDone }) {
  const { address } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const gateway = useGatewayFunding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState([]);
  const validation = useMemo(() => validateAgentPlan(plan), [plan]);
  if (!plan || !validation.ok) return null;

  const request = async (to, data, value = 0n) => connectorClient.request({ method: 'eth_sendTransaction', params: [{ from: address, to, data, value: `0x${value.toString(16)}` }] });
  const switchChain = async (target) => {
    const current = Number(BigInt(await connectorClient.request({ method: 'eth_chainId' })));
    if (current === target.chainId) return;
    const hex = `0x${target.chainId.toString(16)}`;
    try { await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }); }
    catch (caughtError) {
      const code = Number(caughtError?.code);
      if (code !== 4902 && code !== -32603 && code !== -32602) throw caughtError;
      await connectorClient.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: target.name, nativeCurrency: { name: target.name === 'Arc Testnet' ? 'USDC' : 'Ether', symbol: target.name === 'Arc Testnet' ? 'USDC' : 'ETH', decimals: target.name === 'Arc Testnet' ? 6 : 18 }, rpcUrls: [target.rpcUrl], blockExplorerUrls: [target.explorerUrl] }] });
      await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    }
    for (let attempt = 0; attempt < 30; attempt += 1) { const chain = Number(BigInt(await connectorClient.request({ method: 'eth_chainId' }))); if (chain === target.chainId) return; await sleep(250); }
    throw new Error(`Wallet did not switch to ${target.name}.`);
  };
  const waitReceipt = async (hash) => { for (let attempt = 0; attempt < 80; attempt += 1) { const receipt = await connectorClient.request({ method: 'eth_getTransactionReceipt', params: [hash] }); if (receipt) { if (receipt.status === '0x0') throw new Error('The signed transaction reverted onchain.'); return receipt; } await sleep(750); } throw new Error('Timed out waiting for the signed transaction.'); };

  const claimReward = async (action) => {
    const response = await fetch(`/reward-manifest.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load the published reward manifest.');
    const manifest = await response.json();
    const position = (manifest.positions || []).find((item) => String(item.tokenId) === String(action.tokenId));
    if (!position) throw new Error(`No published reward entry exists for veCENT #${action.tokenId}.`);
    const data = encodeFunctionData({ abi: REWARDS_ABI, functionName: 'claim', args: [BigInt(manifest.epoch), BigInt(position.tokenId), BigInt(position.amount), position.proof || []] });
    return request(CONTRACT_ADDRESSES.veCentryRewards, data);
  };

  const swap = async (action) => {
    await switchChain(BRIDGE_CHAINS.arc);
    const quoteResponse = await fetch('/api/tower/swap/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputToken: action.inputToken, outputToken: action.outputToken, inputAmount: action.amountRaw, slippageTolerance: Math.min(5000, Math.max(0, Math.round(Number(action.slippage || 0.5) * 100))) }) });
    const quoteJson = await quoteResponse.json();
    if (!quoteResponse.ok || !quoteJson.success) throw new Error(quoteJson.error || 'Unable to obtain a swap quote.');
    const buildResponse = await fetch('/api/tower/swap/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote: quoteJson.data, userAddress: address }) });
    const buildJson = await buildResponse.json();
    if (!buildResponse.ok || !buildJson.success) throw new Error(buildJson.error || 'Unable to prepare the swap.');
    if (buildJson.data?.approval?.to) { const approvalHash = await request(buildJson.data.approval.to, buildJson.data.approval.data, BigInt(buildJson.data.approval.value || 0)); await waitReceipt(approvalHash); }
    if (!buildJson.data?.swap?.to) throw new Error('Swap transaction was not prepared.');
    return request(buildJson.data.swap.to, buildJson.data.swap.data, BigInt(buildJson.data.swap.value || 0));
  };

  const bridge = async (action) => {
    const from = BRIDGE_CHAINS[String(action.fromChain).toLowerCase()];
    const to = BRIDGE_CHAINS[String(action.toChain).toLowerCase()];
    if (!from || !to || from.chainId === to.chainId) throw new Error('Invalid bridge route.');
    await switchChain(from);
    const amountRaw = parseUnits(String(action.amount), 6);
    const allowanceData = encodeFunctionData({ abi: ERC20_ABI, functionName: 'allowance', args: [address, TOKEN_MESSENGER_V2] });
    const allowanceHex = await connectorClient.request({ method: 'eth_call', params: [{ to: from.usdc, data: allowanceData }, 'latest'] });
    if (BigInt(allowanceHex) < amountRaw) { const approvalHash = await request(from.usdc, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [TOKEN_MESSENGER_V2, amountRaw] })); await waitReceipt(approvalHash); }
    const data = encodeFunctionData({ abi: TOKEN_MESSENGER_ABI, functionName: 'depositForBurn', args: [amountRaw, to.domain, padAddress(address), from.usdc, ZERO_BYTES32, 1000n, 2000] });
    return request(TOKEN_MESSENGER_V2, data);
  };

  const execute = async () => {
    if (!address || !connectorClient?.request) return setError('Your wallet provider is not available. Reconnect your wallet and try again.');
    setBusy(true); setError('');
    try {
      for (const action of plan.actions) {
        let hash;
        if (action.type === AGENT_ACTIONS.GATEWAY_FUND) hash = (await gateway.ensureArcUsdc(action.amount)).mintHash || 'gateway-complete';
        else if (action.type === AGENT_ACTIONS.CLAIM_REWARD) { await switchChain(BRIDGE_CHAINS.arc); hash = await claimReward(action); }
        else if (action.type === AGENT_ACTIONS.SWAP) hash = await swap(action);
        else if (action.type === AGENT_ACTIONS.BRIDGE) hash = await bridge(action);
        else { await switchChain(BRIDGE_CHAINS.arc); const tx = buildAgentWalletRequest(action); if (!tx) throw new Error(`Unable to prepare ${describeAgentAction(action)}.`); hash = await request(tx.to, tx.data, tx.value); }
        setCompleted((current) => [...current, { action, hash }]);
        if (hash && hash !== 'gateway-complete') await waitReceipt(hash);
      }
      onDone?.();
    } catch (caughtError) { setError(caughtError?.shortMessage || caughtError?.message || 'Wallet execution failed.'); }
    finally { setBusy(false); }
  };

  return <section className={styles.card} aria-label="Centrion execution plan">
    <div className={styles.header}><div><span className={styles.eyebrow}>READY TO EXECUTE</span><h3>{plan.title || 'Centry action'}</h3><p>{plan.reason || 'Centrion prepared this action from your request.'}</p></div></div>
    <div className={styles.actions}>{plan.actions.map((action, index) => <div className={styles.action} key={`${action.type}-${index}`}><span>{index + 1}</span><strong>{describeAgentAction(action)}</strong></div>)}</div>
    {completed.length ? <div className={styles.completed}>{completed.map((item, index) => <div key={`${item.hash}-${index}`}>Signed and submitted · <code>{String(item.hash).slice(0, 10)}…</code></div>)}</div> : null}
    {error ? <div className={styles.error}>{error}</div> : null}
    <button type="button" className={styles.execute} disabled={busy || completed.length >= plan.actions.length} onClick={() => void execute()}>{busy ? 'Waiting for wallet…' : completed.length >= plan.actions.length ? 'Completed' : `Sign ${plan.actions.length} action${plan.actions.length === 1 ? '' : 's'}`}</button>
    <p className={styles.note}>Centrion prepares the action. Your wallet approves every onchain transaction.</p>
  </section>;
}
