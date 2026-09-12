import { useCallback, useEffect, useState } from 'react';
import { encodeFunctionData, parseUnits } from 'viem';
import { useAccount, useChainId, useConnectorClient } from 'wagmi';
import {
  GATEWAY_TESTNET_CHAINS,
  GATEWAY_MINTER_ADDRESS,
} from '../constants/circleGateway';
import {
  ARC_CHAIN_ID,
  ARC_GATEWAY_CHAIN,
  GATEWAY_EIP712_DOMAIN,
  GATEWAY_EIP712_TYPES,
  buildTransferSpec,
  estimateGatewayTransfer,
  pickGatewaySource,
  requestGatewayAttestation,
} from '../lib/gatewayFunding';

const GATEWAY_MINTER_ABI = [{
  type: 'function',
  name: 'gatewayMint',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'attestationPayload', type: 'bytes' },
    { name: 'signature', type: 'bytes' },
  ],
  outputs: [],
}];

const ERC20_BALANCE_ABI = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}];

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function useGatewayFunding() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: connectorClient } = useConnectorClient();
  const [balances, setBalances] = useState([]);
  const [total, setTotal] = useState('0');
  const [loading, setLoading] = useState(false);

  const request = useCallback(async (method, params = []) => {
    if (!connectorClient?.request) throw new Error('The connected wallet does not expose a provider.');
    return connectorClient.request({ method, params });
  }, [connectorClient]);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalances([]);
      setTotal('0');
      return [];
    }
    setLoading(true);
    try {
      const response = await fetch('/api/circle/gateway/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositor: address }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to read Gateway balance.');
      const nextBalances = Array.isArray(result.balances) ? result.balances : [];
      setBalances(nextBalances);
      setTotal(result.total || '0');
      return nextBalances;
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  const switchToChain = useCallback(async (target) => {
    if (!connectorClient?.request || !isConnected) throw new Error('Connect your wallet first.');
    if (chainId === target.chainId) return;
    const chainHex = `0x${target.chainId.toString(16)}`;
    try {
      await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
    } catch (caughtError) {
      const code = Number(caughtError?.code);
      if (code !== 4902 && code !== -32603 && code !== -32602) throw caughtError;
      await connectorClient.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: chainHex,
        chainName: target.name,
        nativeCurrency: target.nativeCurrency,
        rpcUrls: [target.rpcUrl],
        blockExplorerUrls: [target.explorerUrl],
      }] });
      await connectorClient.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const current = await connectorClient.request({ method: 'eth_chainId' });
      if (Number(BigInt(current)) === target.chainId) return;
      await sleep(250);
    }
    throw new Error(`Wallet did not switch to ${target.name}.`);
  }, [chainId, connectorClient, isConnected]);

  const ensureArcUsdc = useCallback(async (amount) => {
    if (!address || !isConnected) throw new Error('Connect your wallet first.');
    const value = parseUnits(String(amount), 6);
    const currentBalances = await refresh();
    const source = pickGatewaySource(currentBalances, value);
    if (!source) throw new Error(`Gateway does not have enough finalized USDC to cover ${amount} USDC.`);

    if (source.chainId === ARC_CHAIN_ID) {
      throw new Error('Gateway balance is on Arc. Select Arc wallet for an on-Arc transaction; Gateway cannot be used as a direct contract balance.');
    }

    await switchToChain(GATEWAY_TESTNET_CHAINS.find((chain) => chain.chainId === source.chainId) || source);

    const spec = buildTransferSpec({
      source,
      destination: ARC_GATEWAY_CHAIN,
      depositor: address,
      recipient: address,
      value,
    });
    const estimated = await estimateGatewayTransfer(spec);
    const burnIntent = {
      maxBlockHeight: String(estimated.maxBlockHeight),
      maxFee: String(estimated.maxFee),
      spec: estimated.spec || spec,
    };

    const typedData = {
      domain: GATEWAY_EIP712_DOMAIN,
      types: GATEWAY_EIP712_TYPES,
      primaryType: 'BurnIntent',
      message: burnIntent,
    };

    const signature = await request('eth_signTypedData_v4', [address, JSON.stringify(typedData)]);
    const attestation = await requestGatewayAttestation(burnIntent, signature);

    await switchToChain(ARC_GATEWAY_CHAIN);
    const mintData = encodeFunctionData({
      abi: GATEWAY_MINTER_ABI,
      functionName: 'gatewayMint',
      args: [attestation.attestation, attestation.signature],
    });
    const mintHash = await request('eth_sendTransaction', [{ from: address, to: GATEWAY_MINTER_ADDRESS, data: mintData, value: '0x0' }]);

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const receipt = await request('eth_getTransactionReceipt', [mintHash]);
      if (receipt) {
        if (receipt.status === '0x0') throw new Error('Gateway mint was reverted on Arc Testnet.');
        await refresh();
        return { source, mintHash, attestation };
      }
      await sleep(1500);
    }
    throw new Error('Timed out waiting for the Gateway mint to confirm on Arc Testnet.');
  }, [address, isConnected, refresh, request, switchToChain]);

  return {
    balances,
    total,
    loading,
    refresh,
    ensureArcUsdc,
  };
}
