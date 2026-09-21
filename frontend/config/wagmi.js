import { createConfig, http } from 'wagmi';
import { defineChain, fallback } from 'viem';
import { injected } from 'wagmi/connectors';
import { walletConnect } from '@wagmi/connectors/walletConnect';

export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc Mainnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://explorer.arc.io',
    },
  },
});

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = [
  injected({
    shimDisconnect: true,
  }),
];

if (walletConnectProjectId) {
  connectors.push(
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: false,
      metadata: {
        name: 'Centry',
        description: 'Arc-native lending protocol',
        url: 'https://centry.ink',
        icons: [],
      },
    }),
  );
}

const DEFAULT_ARC_RPC_URL = 'https://rpc.mainnet.arc.io';

function usableRpcUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const arcRpcUrls = [
  usableRpcUrl(process.env.NEXT_PUBLIC_ARC_RPC_URL),
  DEFAULT_ARC_RPC_URL,
].filter((url, index, list) => Boolean(url) && list.indexOf(url) === index);

export const config = createConfig({
  chains: [arcMainnet],
  connectors,
  transports: {
    [arcMainnet.id]: fallback(
      arcRpcUrls.map((url) => http(url)),
      { rank: true },
    ),
  },
  ssr: true,
});
