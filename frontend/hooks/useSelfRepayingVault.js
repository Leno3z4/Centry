import { useEffect, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { parseUnits } from 'viem';
import { arcTestnet } from '../config/multiWagmi';
import { CONTRACT_ADDRESSES, hasAddress } from '../constants/contracts';
import {
  SELF_REPAYING_FACTORY_ABI,
  SELF_REPAYING_POSITION_ABI,
} from '../constants/selfRepaying';
import { ERC20_ABI } from '../constants/abis';

export function useSelfRepayingVault() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [selectedPosition, setSelectedPosition] = useState('');
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);
  const [transactionError, setTransactionError] = useState(null);

  const configured =
    hasAddress('selfRepayingFactory') &&
    hasAddress('yieldVault') &&
    hasAddress('USDC') &&
    hasAddress('positionCollateral');
  const correctNetwork = chainId === arcTestnet.id;
  const walletEnabled = configured && Boolean(address) && correctNetwork;

  const { data: positions, refetch: refetchPositions } = useReadContract({
    address: CONTRACT_ADDRESSES.selfRepayingFactory,
    abi: SELF_REPAYING_FACTORY_ABI,
    functionName: 'positionsOf',
    args: [address],
    query: { enabled: walletEnabled },
  });

  useEffect(() => {
    const latest = positions?.[positions.length - 1] || '';
    if (!selectedPosition || !positions?.includes(selectedPosition)) {
      setSelectedPosition(latest);
    }
  }, [positions, selectedPosition]);

  const positionEnabled = walletEnabled && Boolean(selectedPosition);
  const positionQuery = { enabled: positionEnabled };

  const { data: positionOpen, refetch: refetchOpen } = useReadContract({
    address: selectedPosition,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'positionOpen',
    query: positionQuery,
  });

  const { data: collateralSupplied, refetch: refetchCollateral } =
    useReadContract({
      address: selectedPosition,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'collateralSupplied',
      query: positionQuery,
    });

  const { data: yieldPrincipal, refetch: refetchYieldPrincipal } =
    useReadContract({
      address: selectedPosition,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'yieldPrincipal',
      query: positionQuery,
    });

  const { data: currentDebt, refetch: refetchDebt } = useReadContract({
    address: selectedPosition,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'currentDebt',
    query: positionQuery,
  });

  const { data: currentYieldAssets, refetch: refetchYieldAssets } =
    useReadContract({
      address: selectedPosition,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'currentYieldAssets',
      query: positionQuery,
    });

  const { data: harvestableProfit, refetch: refetchProfit } =
    useReadContract({
      address: selectedPosition,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'harvestableProfit',
      query: positionQuery,
    });

  const { data: healthFactor, refetch: refetchHealth } = useReadContract({
    address: selectedPosition,
    abi: SELF_REPAYING_POSITION_ABI,
    functionName: 'healthFactor',
    query: positionQuery,
  });

  const { data: collateralAllowance, refetch: refetchAllowance } =
    useReadContract({
      address: CONTRACT_ADDRESSES.positionCollateral,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, selectedPosition],
      query: {
        enabled: walletEnabled && Boolean(selectedPosition),
      },
    });

  const { writeContractAsync } = useWriteContract();

  const sendAndWait = async (request) => {
    if (!address) {
      throw new Error('Connect your wallet before submitting a transaction.');
    }

    if (!correctNetwork) {
      throw new Error('Switch your wallet to Arc Testnet before submitting.');
    }

    if (!publicClient) {
      throw new Error('Wallet client is not ready. Please reconnect your wallet.');
    }

    setTransactionPending(true);
    setTransactionError(null);

    try {
      const hash = await writeContractAsync(request);
      setTransactionHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== 'success') {
        throw new Error('The transaction was reverted onchain.');
      }

      return hash;
    } catch (error) {
      setTransactionError(error);
      throw error;
    } finally {
      setTransactionPending(false);
    }
  };

  const createPosition = async () => {
    await sendAndWait({
      address: CONTRACT_ADDRESSES.selfRepayingFactory,
      abi: SELF_REPAYING_FACTORY_ABI,
      functionName: 'createPosition',
      args: [CONTRACT_ADDRESSES.positionCollateral],
    });

    const result = await refetchPositions();
    const latest = result.data?.[result.data.length - 1] || '';
    setSelectedPosition(latest);
    return latest || null;
  };

  const approveCollateral = async (amount) => {
    return sendAndWait({
      address: CONTRACT_ADDRESSES.positionCollateral,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [selectedPosition, parseUnits(String(amount), 18)],
    });
  };

  const depositCollateral = (amount) =>
    sendAndWait({
      address: selectedPosition,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'depositCollateral',
      args: [parseUnits(String(amount), 18)],
    });

  const openPosition = (amount) =>
    sendAndWait({
      address: selectedPosition,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'openPosition',
      args: [parseUnits(String(amount), 6)],
    });

  const harvestAndRepay = () =>
    sendAndWait({
      address: selectedPosition,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'harvestAndRepay',
    });

  const closePosition = () =>
    sendAndWait({
      address: selectedPosition,
      abi: SELF_REPAYING_POSITION_ABI,
      functionName: 'closePosition',
    });

  const refetchAll = async () => {
    await Promise.all([
      refetchPositions(),
      refetchOpen(),
      refetchCollateral(),
      refetchYieldPrincipal(),
      refetchDebt(),
      refetchYieldAssets(),
      refetchProfit(),
      refetchHealth(),
      refetchAllowance(),
    ]);
  };

  return {
    configured,
    positions: positions || [],
    selectedPosition,
    setSelectedPosition,
    positionOpen: Boolean(positionOpen),
    collateralSupplied: collateralSupplied || 0n,
    yieldPrincipal: yieldPrincipal || 0n,
    currentDebt: currentDebt || 0n,
    currentYieldAssets: currentYieldAssets || 0n,
    harvestableProfit: harvestableProfit || 0n,
    healthFactor: healthFactor || 0n,
    collateralAllowance: collateralAllowance || 0n,
    transactionPending,
    transactionHash,
    transactionError,
    createPosition,
    approveCollateral,
    depositCollateral,
    openPosition,
    harvestAndRepay,
    closePosition,
    refetchAll,
  };
}
