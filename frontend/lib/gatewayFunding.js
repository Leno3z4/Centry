import { pad, parseUnits } from 'viem';
import {
  GATEWAY_MINTER_ADDRESS,
  GATEWAY_TESTNET_CHAINS,
  GATEWAY_WALLET_ADDRESS,
} from '../constants/circleGateway';

export const ARC_CHAIN_ID = 5042002;
export const ARC_GATEWAY_CHAIN = GATEWAY_TESTNET_CHAINS.find((chain) => chain.chainId === ARC_CHAIN_ID) || GATEWAY_TESTNET_CHAINS[0];
export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
export const MAX_UINT256 = ((1n << 256n) - 1n).toString();

export const GATEWAY_EIP712_DOMAIN = { name: 'GatewayWallet', version: '1' };

export const GATEWAY_EIP712_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
  ],
  TransferSpec: [
    { name: 'version', type: 'uint32' },
    { name: 'sourceDomain', type: 'uint32' },
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'sourceContract', type: 'bytes32' },
    { name: 'destinationContract', type: 'bytes32' },
    { name: 'sourceToken', type: 'bytes32' },
    { name: 'destinationToken', type: 'bytes32' },
    { name: 'sourceDepositor', type: 'bytes32' },
    { name: 'destinationRecipient', type: 'bytes32' },
    { name: 'sourceSigner', type: 'bytes32' },
    { name: 'destinationCaller', type: 'bytes32' },
    { name: 'value', type: 'uint256' },
    { name: 'salt', type: 'bytes32' },
    { name: 'hookData', type: 'bytes' },
  ],
  BurnIntent: [
    { name: 'maxBlockHeight', type: 'uint256' },
    { name: 'maxFee', type: 'uint256' },
    { name: 'spec', type: 'TransferSpec' },
  ],
};

export function addressToBytes32(address) {
  return pad(address.toLowerCase(), { size: 32 });
}

export function pickGatewaySource(balances, amountRaw) {
  const needed = typeof amountRaw === 'bigint' ? amountRaw : BigInt(String(amountRaw));
  const normalized = (Array.isArray(balances) ? balances : []).filter((chain) => chain?.chainId != null);

  return normalized
    .filter((chain) => {
      try { return parseUnits(String(chain.balance || '0'), 6) >= needed; } catch { return false; }
    })
    .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))[0] || null;
}

export function buildTransferSpec({ source, destination = ARC_GATEWAY_CHAIN, depositor, recipient, value }) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return {
    version: 1,
    sourceDomain: source.domain,
    destinationDomain: destination.domain,
    sourceContract: addressToBytes32(GATEWAY_WALLET_ADDRESS),
    destinationContract: addressToBytes32(GATEWAY_MINTER_ADDRESS),
    sourceToken: addressToBytes32(source.usdc),
    destinationToken: addressToBytes32(destination.usdc),
    sourceDepositor: addressToBytes32(depositor),
    destinationRecipient: addressToBytes32(recipient),
    sourceSigner: addressToBytes32(depositor),
    destinationCaller: ZERO_BYTES32,
    value: String(value),
    salt: `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
    hookData: '0x',
  };
}

async function apiRequest(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.success) throw new Error(json?.error || `Gateway request failed with HTTP ${response.status}.`);
  return json;
}

export async function estimateGatewayTransfer(spec) {
  const json = await apiRequest('/api/circle/gateway/estimate', { spec });
  return json.burnIntent;
}

export async function requestGatewayAttestation(burnIntent, signature) {
  return apiRequest('/api/circle/gateway/transfer', { burnIntent, signature });
}
