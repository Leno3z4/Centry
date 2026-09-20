'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useConnectorClient } from 'wagmi';
import { encodeFunctionData, parseUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { ERC20_ABI } from '../constants/abis';
import { describeAgentAction, validateAgentPlan, buildAgentWalletRequest, AGENT_ACTIONS } from '../lib/agentExecution';
import { useGatewayFunding } from '../hooks/useGatewayFunding';
import styles from './CentryExecutionPanel.module.css';

const TOKEN_MESSENGER_V2 = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const TOKEN_MESSENGER_ABI = [{ type: 'function', name: 'depositForBurn', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'destinationDomain', type: 'uint32' }, { name: 'mintRecipient', type: 'bytes32' }, { name: 'burnToken', type: 'address' }, { name: 'destinationCaller', type: 'bytes32' }, { name: 'maxFee', type: 'uint256' }, { name: 'minFinalityThreshold', type: 'uint32' }], outputs: [] }];
const BRIDGE_CHAINS = {
  arc: { chainId: 5042, domain: 26, usdc: '0x3600000000000000000000000000000000000000', name: 'Arc Mainnet', rpcUrl: 'https://rpc.mainnet.arc.io', explorerUrl: 'https://explorer.arc.io' },
  base: { chainId: 84532, domain: 6, usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', name: 'Base Sepolia', rpcUrl: 'https://sepolia.base.org', explorerUrl: 'https://sepolia.basescan.org' },
  arbitrum: { chainId: 421614, domain: 3, usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', name: 'Arbitrum Sepolia', rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc', explorerUrl: 'https://sepolia.arbiscan.io' },
  ethereum: { chainId: 11155111, domain: 0, usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', name: 'Ethereum Sepolia', rpcUrl: 'https://rpc.sepolia.org', explorerUrl: 'https://sepolia.etherscan.io' },
};
const REWARDS_ABI = [{ type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [{ name: 'epoch', type: 'uint256' }, { name: 'tokenId', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'proof', type: 'bytes32[]' }], outputs: [{ type: 'uint256' }] }];
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const padAddress = (a) => `0x${String(a).slice(2).padStart(64, '0')}`;
function approvalLabel(action) {
  if (action?.type === AGENT_ACTIONS.BRIDGE) return 'Approve USDC for bridge';
  if (action?.type === AGENT_ACTIONS.CREATE_LOCK || action?.type === AGENT_ACTIONS.INCREASE_LOCK) return 'Approve CENT';
  if (action?.type === AGENT_ACTIONS.SWAP) return `Approve ${action.inputSymbol || 'input token'} for swap`;
  return `Approve ${action?.assetSymbol || 'token'}`;
}

export default function CentryExecutionPanel({ plan, onDone }) {
  const { address } = useAccount();
  const { data: connectorClient } = useConnectorClient();
  const gateway = useGatewayFunding();
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(true);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState([]);
  const [approvalSteps, setApprovalSteps] = useState([]);
  const [preparedSwaps, setPreparedSwaps] = useState({});
  const autoStarted = useRef(false);
  const validation = useMemo(() => validateAgentPlan(plan), [plan]);

  const request = async (to, data, value = 0n) => connectorClient?.request({ method: 'eth_sendTransaction', params: [{ from: address, to, data, value: `0x${value.toString(16)}` }] });
  const readAllowance = async (token, spender) => {
    const raw = await connectorClient.request({ method: 'eth_call', params: [{ to: token, data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'allowance', args: [address, spender] }) }, 'latest'] });
    return BigInt(raw);
  };
  const switchChain = async (target) => {
    const current = Number(BigInt(await connectorClient.request({ method: 'eth_chainId' })));
    if (current === target.chainId) return;
    const hex = `0x${target.chainId.toString(16)}`;
    try { await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }); }
    catch (e) {
      const code = Number(e?.code);
      if (code !== 4902 && code !== -32603 && code !== -32602) throw e;
      await connectorClient.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: target.name, nativeCurrency: { name: target.name === 'Arc Mainnet' ? 'USDC' : 'Ether', symbol: target.name === 'Arc Mainnet' ? 'USDC' : 'ETH', decimals: target.name === 'Arc Mainnet' ? 18 : 18 }, rpcUrls: [target.rpcUrl], blockExplorerUrls: [target.explorerUrl] }] });
      await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    }
    for (let i = 0; i < 30; i += 1) { const c = Number(BigInt(await connectorClient.request({ method: 'eth_chainId' }))); if (c === target.chainId) return; await sleep(250); }
    throw new Error(`Wallet did not switch to ${target.name}.`);
  };
  const waitReceipt = async (hash) => {
    for (let i = 0; i < 80; i += 1) { const receipt = await connectorClient.request({ method: 'eth_getTransactionReceipt', params: [hash] }); if (receipt) { if (receipt.status === '0x0') throw new Error('The signed transaction reverted onchain.'); return receipt; } await sleep(750); }
    throw new Error('Timed out waiting for the signed transaction.');
  };

  useEffect(() => {
    let cancelled = false;
    const preflight = async () => {
      if (!plan || !validation.ok || !address || !connectorClient?.request) return;
      setPreparing(true); setError(''); setApprovalSteps([]); setPreparedSwaps({});
      const approvals = []; const swaps = {};
      try {
        for (let index = 0; index < plan.actions.length; index += 1) {
          const action = plan.actions[index];
          if ([AGENT_ACTIONS.SUPPLY, AGENT_ACTIONS.REPAY, AGENT_ACTIONS.CREATE_LOCK, AGENT_ACTIONS.INCREASE_LOCK].includes(action.type)) await switchChain(BRIDGE_CHAINS.arc);
          if ([AGENT_ACTIONS.SUPPLY, AGENT_ACTIONS.REPAY].includes(action.type)) {
            const amount = parseUnits(String(action.amount), Number(action.decimals ?? 6));
            if (await readAllowance(action.asset, CONTRACT_ADDRESSES.lendingPool) < amount) approvals.push({ index, label: approvalLabel(action), action });
          } else if ([AGENT_ACTIONS.CREATE_LOCK, AGENT_ACTIONS.INCREASE_LOCK].includes(action.type)) {
            const amount = parseUnits(String(action.amount), 18);
            if (await readAllowance(CONTRACT_ADDRESSES.centryToken, CONTRACT_ADDRESSES.veCentry) < amount) approvals.push({ index, label: approvalLabel(action), action });
          } else if (action.type === AGENT_ACTIONS.BRIDGE) {
            const from = BRIDGE_CHAINS[String(action.fromChain).toLowerCase()];
            if (from) {
              await switchChain(from);
              const amount = parseUnits(String(action.amount), 6);
              if (await readAllowance(from.usdc, TOKEN_MESSENGER_V2) < amount) approvals.push({ index, label: approvalLabel(action), action });
            }
          } else if (action.type === AGENT_ACTIONS.SWAP) {
            await switchChain(BRIDGE_CHAINS.arc);
            const quoteResponse = await fetch('/api/tower/swap/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputToken: action.inputToken, outputToken: action.outputToken, inputAmount: action.amountRaw, slippageTolerance: Math.min(5000, Math.max(0, Math.round(Number(action.slippage || 0.5) * 100))) }) });
            const quote = await quoteResponse.json();
            if (!quoteResponse.ok || !quote.success) throw new Error(quote.error || 'Unable to prepare the swap preview.');
            const buildResponse = await fetch('/api/tower/swap/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote: quote.data, userAddress: address }) });
            const build = await buildResponse.json();
            if (!buildResponse.ok || !build.success) throw new Error(build.error || 'Unable to prepare the swap preview.');
            swaps[index] = { quote: quote.data, build: build.data };
            if (build.data?.approval?.to) approvals.push({ index, label: approvalLabel(action), action, swapApproval: build.data.approval });
          }
        }
        if (!cancelled) { setApprovalSteps(approvals); setPreparedSwaps(swaps); }
      } catch (e) { if (!cancelled) setError(e?.message || 'Unable to prepare the execution preview.'); }
      finally { if (!cancelled) setPreparing(false); }
    };
    void preflight();
    return () => { cancelled = true; };
  }, [plan, validation.ok, address, connectorClient]);

  const ensureLendingApproval = async (action) => {
    if (![AGENT_ACTIONS.SUPPLY, AGENT_ACTIONS.REPAY].includes(action.type) || !action.asset) return;
    const amount = parseUnits(String(action.amount), Number(action.decimals ?? 6));
    if (await readAllowance(action.asset, CONTRACT_ADDRESSES.lendingPool) < amount) { const hash = await request(action.asset, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CONTRACT_ADDRESSES.lendingPool, amount] })); setCompleted((c) => [...c, { action: { type: AGENT_ACTIONS.APPROVE_ASSET, assetSymbol: action.assetSymbol || 'token', amount: String(action.amount) }, hash }]); await waitReceipt(hash); }
  };
  const ensureCentApproval = async (action) => {
    if (![AGENT_ACTIONS.CREATE_LOCK, AGENT_ACTIONS.INCREASE_LOCK].includes(action.type)) return;
    const amount = parseUnits(String(action.amount), 18);
    if (await readAllowance(CONTRACT_ADDRESSES.centryToken, CONTRACT_ADDRESSES.veCentry) < amount) { const hash = await request(CONTRACT_ADDRESSES.centryToken, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CONTRACT_ADDRESSES.veCentry, amount] })); setCompleted((c) => [...c, { action: { type: AGENT_ACTIONS.APPROVE_CENT, amount: String(action.amount) }, hash }]); await waitReceipt(hash); }
  };
  const claimReward = async (action) => {
    const response = await fetch(`/reward-manifest.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load the published reward manifest.');
    const manifest = await response.json(); const position = (manifest.positions || []).find((item) => String(item.tokenId) === String(action.tokenId));
    if (!position) throw new Error(`No published reward entry exists for veCENT #${action.tokenId}.`);
    return request(CONTRACT_ADDRESSES.veCentryRewards, encodeFunctionData({ abi: REWARDS_ABI, functionName: 'claim', args: [BigInt(manifest.epoch), BigInt(position.tokenId), BigInt(position.amount), position.proof || []] }));
  };
  const swap = async (action, index) => {
    await switchChain(BRIDGE_CHAINS.arc);
    const prepared = preparedSwaps[index];
    if (!prepared?.build?.swap?.to || !prepared?.quote) throw new Error('Swap transaction was not prepared.');
    let built = prepared.build;
    if (built.approval?.to) {
      const approvalHash = await request(built.approval.to, built.approval.data, BigInt(built.approval.value || 0));
      setCompleted((c) => [...c, { action: { type: AGENT_ACTIONS.APPROVE_ASSET, amount: String(action.amount), assetSymbol: action.inputSymbol }, hash: approvalHash }]);
      await waitReceipt(approvalHash);
      const rebuildResponse = await fetch('/api/tower/swap/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote: prepared.quote, userAddress: address }) });
      const rebuild = await rebuildResponse.json().catch(() => ({}));
      if (!rebuildResponse.ok || !rebuild.success || !rebuild.data?.swap?.to) throw new Error(rebuild.error || 'The approval confirmed, but the swap could not be rebuilt.');
      built = rebuild.data;
      if (built.approval?.to) throw new Error('The swap still reports insufficient allowance after approval confirmation.');
    }
    try {
      return await request(built.swap.to, built.swap.data, BigInt(built.swap.value || 0));
    } catch (e) {
      throw new Error(e?.shortMessage || e?.message || 'The swap transaction was rejected by the wallet provider.');
    }
  };
  const bridge = async (action) => {
    const from = BRIDGE_CHAINS[String(action.fromChain).toLowerCase()]; const to = BRIDGE_CHAINS[String(action.toChain).toLowerCase()];
    if (!from || !to || from.chainId === to.chainId) throw new Error('Invalid bridge route.'); await switchChain(from); const raw = parseUnits(String(action.amount), 6);
    if (await readAllowance(from.usdc, TOKEN_MESSENGER_V2) < raw) { const hash = await request(from.usdc, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [TOKEN_MESSENGER_V2, raw] })); setCompleted((c) => [...c, { action: { type: AGENT_ACTIONS.APPROVE_ASSET, amount: String(action.amount), assetSymbol: 'USDC' }, hash }]); await waitReceipt(hash); }
    return request(TOKEN_MESSENGER_V2, encodeFunctionData({ abi: TOKEN_MESSENGER_ABI, functionName: 'depositForBurn', args: [raw, to.domain, padAddress(address), from.usdc, ZERO_BYTES32, 1000n, 2000] }));
  };
  const execute = async () => {
    if (!plan || !validation.ok) return; if (!address || !connectorClient?.request) return setError('Your wallet provider is not available. Reconnect your wallet and try again.');
    setBusy(true); setError('');
    try {
      for (let index = 0; index < plan.actions.length; index += 1) {
        const action = plan.actions[index]; let hash;
        if (action.type === AGENT_ACTIONS.GATEWAY_FUND) hash = (await gateway.ensureArcUsdc(action.amount)).mintHash || 'gateway-complete';
        else if (action.type === AGENT_ACTIONS.CLAIM_REWARD) { await switchChain(BRIDGE_CHAINS.arc); hash = await claimReward(action); }
        else if (action.type === AGENT_ACTIONS.SWAP) hash = await swap(action, index);
        else if (action.type === AGENT_ACTIONS.BRIDGE) hash = await bridge(action);
        else { await switchChain(BRIDGE_CHAINS.arc); await ensureLendingApproval(action); await ensureCentApproval(action); const tx = buildAgentWalletRequest(action); if (!tx) throw new Error(`Unable to prepare ${describeAgentAction(action)}.`); hash = await request(tx.to, tx.data, tx.value); }
        setCompleted((c) => [...c, { action, hash }]); if (hash && hash !== 'gateway-complete') await waitReceipt(hash);
      }
      onDone?.();
    } catch (e) { setError(e?.shortMessage || e?.message || 'Wallet execution failed.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (plan?.autoExecute && !autoStarted.current && !preparing && !busy && address && connectorClient?.request && !error) { autoStarted.current = true; void execute(); }
  }, [plan, preparing, busy, address, connectorClient, error]);

  if (!plan || !validation.ok) return null;
  const steps = plan.actions.flatMap((action, index) => [...approvalSteps.filter((step) => step.index === index).map((step) => ({ ...step, kind: 'approval' })), { index, action, kind: 'action' }]);
  return <section className={styles.card} aria-label="Centrion execution plan">
    <div className={styles.header}><div><span className={styles.eyebrow}>{preparing ? 'PREPARING' : plan.autoExecute ? 'READY — WALLET NEXT' : 'READY TO EXECUTE'}</span><h3>{plan.title || 'Centry action'}</h3><p>{plan.reason || 'Centrion prepared this action from your request.'}</p></div></div>
    <div className={styles.actions}>{steps.map((step, i) => <div className={`${styles.action} ${step.kind === 'approval' ? styles.actionApproval : ''}`} key={`${step.kind}-${step.index}-${i}`}><span>{i + 1}</span><strong>{step.kind === 'approval' ? step.label : describeAgentAction(step.action)}</strong></div>)}</div>
    {preparing ? <div className={styles.note}>Checking allowances before any wallet transaction…</div> : null}
    {completed.length ? <div className={styles.completed}>{completed.map((x, i) => <div key={`${x.hash}-${i}`}>Signed and submitted · <code>{String(x.hash).slice(0, 10)}…</code></div>)}</div> : null}
    {error ? <div className={styles.error}>{error}</div> : null}
    {!plan.autoExecute ? <button type="button" className={styles.execute} disabled={busy || preparing || completed.length >= steps.length} onClick={() => void execute()}>{busy ? 'Waiting for wallet…' : completed.length >= steps.length ? 'Completed' : `Sign ${steps.length} step${steps.length === 1 ? '' : 's'}`}</button> : null}
    <p className={styles.note}>Approvals are shown before the transaction that needs them. Actions that do not require token approval are shown directly.</p>
  </section>;
}
