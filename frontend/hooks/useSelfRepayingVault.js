import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { arcTestnet } from '../config/multiWagmi';
import { CONTRACT_ADDRESSES, hasAddress } from '../constants/contracts';
import {
  SELF_REPAYING_FACTORY_ABI,
  SELF_REPAYING_POSITION_ABI,
} from '../constants/selfRepaying';
import { ERC20_ABI, LENDING_POOL_ABI } from '../constants/abis';

export const COLLATERAL_ASSETS = [
  {
    id: 'ETH',
    symbol: 'mETH',
    name: 'Mock Ethereum',
    address: CONTRACT_ADDRESSES.collateralAssets.ETH,
    decimals: 18,
  },
  {
    id: 'BTC',
    symbol: 'mBTC',
    name: 'Mock Bitcoin',
    address: CONTRACT_ADDRESSES.collateralAssets.BTC,
    decimals: 18,
  },
  {
    id: 'SOL',
    symbol: 'mSOL',
    name: 'Mock Solana',
    address: CONTRACT_ADDRESSES.collateralAssets.SOL,
    decimals: 18,
  },
  {
    id: 'EUR',
    symbol: 'mEUR',
    name: 'Mock Euro',
    address: CONTRACT_ADDRESSES.collateralAssets.EUR,
    decimals: 18,
  },
];

export function getCollateralAsset(address) {
  return (
    COLLATERAL_ASSETS.find(
      (asset) => asset.address?.toLowerCase() === address?.toLowerCase(),
    ) || null
  );
}

export function useSelfRepayingVault() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedCollateral, setSelectedCollateral] = useState(COLLATERAL_ASSETS[0]);
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);
  const [transactionError, setTransactionError] = useState(null);

  const configured =
    hasAddress('selfRepayingFactory') &&
    hasAddress('yieldVault') &&
    hasAddress('USDC') &&
    hasAddress('lendingPool') &&
    COLLATERAL_ASSETS.every((asset) => /^0x[a-fA-F0-9]{40}$/.test(asset.address));

  const correctNetwork = chainId === arcTestnet.id;
  const walletEnabled = configured && Boolean(address) && correctNetwork;
  const factoryAddress = hasAddress('selfRepayingFactory')
    ? CONTRACT_ADDRESSES.selfRepayingFactory
    : undefined;
  const positionAddress = /^0x[a-fA-F0-9]{40}$/.test(selectedPosition)
    ? selectedPosition
    : undefined;
  const collateralAddress = selectedCollateral.address;
  const positionEnabled = walletEnabled && Boolean(positionAddress);
  const positionQuery = { enabled: positionEnabled };

  const { data: positions, refetch: refetchPositions } = useReadContract({
    address: factoryAddress,
    abi: SELF_REPAYING_FACTORY_ABI,
    functionName: 'positionsOf',
    args: [address],
    query: { enabled: walletEnabled },
  });

  const { data: positionOpen, refetch: refetchOpen } = useReadContract({
    address: positionAddress,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'positionOpen',
    query: positionQuery,
  });

  const { data: collateralSupplied, refetch: refetchCollateral } = useReadContract({
    address: positionAddress,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'collateralSupplied',
    query: positionQuery,
  });

  const { data: yieldPrincipal, refetch: refetchYieldPrincipal } = useReadContract({
    address: positionAddress,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'yieldPrincipal',
    query: positionQuery,
  });

  const { data: totalRepaid, refetch: refetchTotalRepaid } = useReadContract({
    address: positionAddress,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'totalRepaid',
    query: positionQuery,
  });

  const { data: currentDebt, refetch: refetchDebt } = useReadContract({
    address: positionAddress,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'currentDebt',
    query: positionQuery,
  });

  const { data: currentYieldAssets, refetch: refetchYieldAssets } = useReadContract({
    address: positionAddress,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'currentYieldAssets',
    query: positionQuery,
  });

  const { data: harvestableProfit, refetch: refetchProfit } = useReadContract({
    address: positionAddress,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'harvestableProfit',
    query: positionQuery,
  });

  const { data: healthFactor, refetch: refetchHealth } = useReadContract({
    address: positionAddress,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'currentHealthFactor',
    query: positionQuery,
  });

  const { data: collateralAssetAddress } = useReadContract({
    address: positionAddress,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'collateralAsset',
    query: positionQuery,
  });

  useEffect(() => {
    const latest = positions?.[positions.length - 1] || '';
    if (!selectedPosition || !positions?.includes(selectedPosition)) {
      setSelectedPosition(latest);
    }
  }, [positions, selectedPosition]);

  useEffect(() => {
    const deployedAsset = getCollateralAsset(collateralAssetAddress);
    if (deployedAsset) {
      setSelectedCollateral(deployedAsset);
    }
  }, [collateralAssetAddress]);

  const { data: collateralAllowance, refetch: refetchAllowance } = useReadContract({
    address: collateralAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, positionAddress],
    query: { enabled: walletEnabled && Boolean(positionAddress) },
  });

  const { data: collateralBalance, refetch: refetchBalance } = useReadContract({
    address: collateralAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    query: { enabled: walletEnabled },
  });

  const { writeContractAsync } = useWriteContract();

  const sendAndWait = async (request) => {
    if (!address) throw new Error('Connect your wallet before submitting a transaction.');
    if (!correctNetwork) throw new Error('Switch your wallet to Arc Testnet before submitting.');
    if (!publicClient) throw new Error('Wallet client is not ready. Please reconnect your wallet.');

    setTransactionPending(true);
    setTransactionError(null);

    try {
      const hash = await writeContractAsync(request);
      setTransactionHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The transaction was reverted onchain.');
      return hash;
    } catch (error) {
      setTransactionError(error);
      throw error;
    } finally {
      setTransactionPending(false);
    }
  };

  const createPosition = async (asset = selectedCollateral.address) => {
    if (!factoryAddress || !asset) throw new Error('Select a collateral asset first.');

    await sendAndWait({
      address: factoryAddress,
      abi: SELF_REPAYING_FACTORY_ABI,
      functionName: 'createPosition',
      args: [asset],
    });

    const result = await refetchPositions();
    const latest = result.data?.[result.data.length - 1] || '';
    setSelectedPosition(latest);
    return latest || null;
  };

  const approveCollateral = async (amount) =>
    sendAndWait({
      address: collateralAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [positionAddress, parseUnits(String(amount), selectedCollateral.decimals)],
    });

  const depositCollateral = (amount) =>
    sendAndWait({
      address: positionAddress,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'depositCollateral',
      args: [parseUnits(String(amount), selectedCollateral.decimals)],
    });

  const openPosition = (amount) =>
    sendAndWait({
      address: positionAddress,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'openPosition',
      args: [parseUnits(String(amount), 6)],
    });

  const repay = async (amount) => {
    if (!positionAddress) throw new Error('Select a position before repaying debt.');

    const parsedAmount = parseUnits(String(amount), 6);

    await sendAndWait({
      address: CONTRACT_ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.lendingPool, parsedAmount],
    });

    return sendAndWait({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'repayFor',
      args: [CONTRACT_ADDRESSES.USDC, positionAddress, parsedAmount],
    });
  };

  const harvestAndRepay = () =>
    sendAndWait({
      address: positionAddress,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'harvestAndRepay',
    });

  const closePosition = () =>
    sendAndWait({
      address: positionAddress,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'closePosition',
    });

  const refetchAll = async () => {
    const requests = [refetchPositions()];

    if (positionAddress) {
      requests.push(
        refetchOpen(),
        refetchCollateral(),
        refetchYieldPrincipal(),
        refetchTotalRepaid(),
        refetchDebt(),
        refetchYieldAssets(),
        refetchProfit(),
        refetchHealth(),
        refetchAllowance(),
      );
    }

    if (collateralAddress) requests.push(refetchBalance());
    await Promise.all(requests);
  };

  const healthFactorPercent = useMemo(() => {
    if (!positionAddress || !positionOpen) return 100;

    const debt = currentDebt ?? 0n;
    if (debt === 0n) return 100;

    const health = Number(formatUnits(healthFactor ?? 0n, 18));
    if (!Number.isFinite(health)) return 0;

    return Math.round(
      Math.min(
        Math.max(((health - 1) / 2) * 100, 0),
        100,
      ),
    );
  }, [currentDebt, healthFactor, positionAddress, positionOpen]);

  return {
    configured,
    positions: positions || [],
    selectedPosition,
    setSelectedPosition,
    selectedCollateral,
    setSelectedCollateral,
    collateralAssets: COLLATERAL_ASSETS,
    collateralAssetAddress,
    collateralBalance: collateralBalance || 0n,
    collateralAllowance: collateralAllowance || 0n,
    positionOpen: Boolean(positionOpen),
    collateralSupplied: collateralSupplied || 0n,
    yieldPrincipal: yieldPrincipal || 0n,
    totalRepaid: totalRepaid || 0n,
    currentDebt: currentDebt || 0n,
    currentYieldAssets: currentYieldAssets || 0n,
    harvestableProfit: harvestableProfit || 0n,
    healthFactor: healthFactor || 0n,
    healthFactorPercent,
    transactionPending,
    transactionHash,
    transactionError,
    createPosition,
    approveCollateral,
    depositCollateral,
    openPosition,
    repay,
    harvestAndRepay,
    closePosition,
    refetchAll,
  };
}
