import { createConfig, fallback, http } from 'wagmi';
import { defineChain } from 'viem';
import { injected } from 'wagmi/connectors';
import { walletConnect } from '@wagmi/connectors/walletConnect';

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
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
        url: 'https://centry-car-xen.vercel.app',
        icons: [],
      },
    }),
  );
}

const arcRpcUrls = [
  process.env.NEXT_PUBLIC_ARC_RPC_URL,
  'https://rpc.testnet.arc.network',
  'https://rpc.drpc.testnet.arc.network',
  'https://rpc.quicknode.testnet.arc.network',
  'https://rpc.blockdaemon.testnet.arc.network',
].filter(Boolean);

export const config = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: fallback(
      arcRpcUrls.map((url) => http(url)),
      { rank: true },
    ),
  },
  ssr: true,
});
