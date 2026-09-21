import { createConfig, createConnector, http } from 'wagmi';
import { defineChain, fallback } from 'viem';
import EthereumProvider from '@walletconnect/ethereum-provider';

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
const ARC_CHAIN_HEX = `0x${arcMainnet.id.toString(16)}`;
const ARC_ADD_CHAIN_PARAMS = {
  chainId: ARC_CHAIN_HEX,
  chainName: 'Arc Mainnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: ['https://rpc.mainnet.arc.io'],
  blockExplorerUrls: ['https://explorer.arc.io'],
};

async function switchOrAddArc(provider) {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_HEX }],
    });
  } catch (error) {
    const code = Number(error?.code);
    if (code !== 4902 && code !== -32603 && code !== -32602) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [ARC_ADD_CHAIN_PARAMS],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_HEX }],
    });
  }
}

function centryWalletConnect() {
  let provider;

  const createProvider = async () => {
    if (!walletConnectProjectId) {
      throw new Error(
        'WalletConnect is not configured. Add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in Vercel.',
      );
    }

    if (!provider) {
      provider = await EthereumProvider.init({
        projectId: walletConnectProjectId,
        chains: [arcMainnet.id],
        optionalChains: [arcMainnet.id],
        showQrModal: true,
        metadata: {
          name: 'Centry',
          description: 'Arc-native lending protocol',
          url: 'https://centry.ink',
          icons: [],
        },
      });
    }

    return provider;
  };

  return createConnector((config) => ({
    id: 'centry-walletconnect',
    name: 'WalletConnect',
    type: 'walletConnect',

    async connect({ chainId } = {}) {
      const wcProvider = await createProvider();
      const targetChainId = chainId ?? arcMainnet.id;

      if (wcProvider.session) {
        try {
          await wcProvider.disconnect();
        } catch {
          // Continue and start a fresh session below.
        }
      }

      await wcProvider.connect({ chains: [targetChainId] });

      const accounts = wcProvider.accounts || [];
      const connectedChainId = Number(wcProvider.chainId || targetChainId);

      if (!accounts.length) {
        throw new Error('WalletConnect did not return an account.');
      }

      config.emitter.emit('connect', {
        accounts,
        chainId: connectedChainId,
      });

      return { accounts, chainId: connectedChainId };
    },

    async disconnect() {
      if (!provider) return;
      try {
        await provider.disconnect();
      } finally {
        provider = undefined;
      }
    },

    async getAccounts() {
      const wcProvider = await createProvider();
      return wcProvider.accounts || [];
    },

    async getChainId() {
      const wcProvider = await createProvider();
      return Number(wcProvider.chainId || arcMainnet.id);
    },

    async getProvider() {
      return createProvider();
    },

    async isAuthorized() {
      return Boolean(provider?.session && provider.accounts?.length);
    },

    async switchChain({ chainId }) {
      const wcProvider = await createProvider();
      if (chainId !== arcMainnet.id) {
        throw new Error('Centry only supports Arc Mainnet.');
      }
      await switchOrAddArc(wcProvider);
      return config.chains.find((chain) => chain.id === chainId) || arcMainnet;
    },

    onAccountsChanged(accounts) {
      config.emitter.emit('change', { accounts });
    },

    onChainChanged(chainId) {
      config.emitter.emit('change', { chainId: Number(chainId) });
    },

    onDisconnect() {
      config.emitter.emit('disconnect');
    },
  }));
}

const connectors = [];
if (walletConnectProjectId) connectors.push(centryWalletConnect());

const DEFAULT_ARC_RPC_URLS = [
  'https://rpc.mainnet.arc.io',
  'https://rpc.arc-scan.org',
];

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
  ...DEFAULT_ARC_RPC_URLS,
].filter((url, index, list) => Boolean(url) && list.indexOf(url) === index);

export const config = createConfig({
  chains: [arcMainnet],
  connectors,
  transports: {
    [arcMainnet.id]: fallback(
      arcRpcUrls.map((url) => http(url, {
        retryCount: 0,
        timeout: 10000,
      })),
      { rank: false },
    ),
  },
  multiInjectedProviderDiscovery: true,
  ssr: true,
});
