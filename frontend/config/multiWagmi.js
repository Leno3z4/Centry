import { createConfig, createConnector, http } from 'wagmi';
import { defineChain } from 'viem';
import EthereumProvider from '@walletconnect/ethereum-provider';

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

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

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
        chains: [arcTestnet.id],
        optionalChains: [],
        showQrModal: true,
        metadata: {
          name: 'Centry',
          description: 'Arc-native lending protocol',
          url: 'https://centry-car-xen.vercel.app',
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
      const targetChainId = chainId ?? arcTestnet.id;

      if (wcProvider.session) {
        try {
          await wcProvider.disconnect();
        } catch {
          // Continue and start a fresh session below.
        }
      }

      await wcProvider.connect({
        chains: [targetChainId],
      });

      const accounts = wcProvider.accounts || [];
      const connectedChainId = Number(wcProvider.chainId || targetChainId);

      if (!accounts.length) {
        throw new Error('WalletConnect did not return an account.');
      }

      config.emitter.emit('connect', {
        accounts,
        chainId: connectedChainId,
      });

      return {
        accounts,
        chainId: connectedChainId,
      };
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
      return Number(wcProvider.chainId || arcTestnet.id);
    },

    async getProvider() {
      return createProvider();
    },

    async isAuthorized() {
      return Boolean(provider?.session && provider.accounts?.length);
    },

    async switchChain({ chainId }) {
      const wcProvider = await createProvider();

      if (chainId !== arcTestnet.id) {
        throw new Error('Centry only supports Arc Testnet.');
      }

      await wcProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });

      return config.chains.find((chain) => chain.id === chainId) || arcTestnet;
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

if (walletConnectProjectId) {
  connectors.push(centryWalletConnect());
}

export const config = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
  },
  multiInjectedProviderDiscovery: true,
  ssr: true,
});
