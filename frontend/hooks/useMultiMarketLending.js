import { useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import { formatUnits, maxUint256, parseUnits } from 'viem';
import { CONTRACT_ADDRESSES, hasAddress } from '../constants/contracts';
import { ACTIVE_MARKETS } from '../constants/markets';
import { ERC20_ABI, LENDING_POOL_ABI, ORACLE_ABI } from '../constants/abis';
import { arcTestnet } from '../config/multiWagmi';

const ZERO = 0n;
const MAX_UINT256 = maxUint256;
const TEN = 10n;

function formatDynamic(value, decimals) {
  return formatUnits(value ?? ZERO, decimals);
}

export function useMultiMarketLending(asset, decimals = 18) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);
  const [transactionError, setTransactionError] = useState(null);

  const configured =
    hasAddress('lendingPool') &&
    /^0x[a-fA-F0-9]{40}$/.test(asset || '');
  const correctNetwork = !address || chainId === arcTestnet.id;
  const commonQuery = { enabled: configured && correctNetwork };
  const walletQuery = {
    enabled: configured && Boolean(address) && correctNetwork,
  };

  const {
    data: reserveConfigRaw,
    refetch: refetchReserve,
    isLoading: reserveLoading,
    isFetching: reserveFetching,
  } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'getReserveConfig',
    args: [asset],
    query: commonQuery,
  });

  const { data: supplyBalanceRaw, refetch: refetchUserSupply } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'supplyBalance',
    args: [address, asset],
    query: walletQuery,
  });

  const { data: borrowBalanceRaw, refetch: refetchUserBorrow } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'borrowBalance',
    args: [address, asset],
    query: walletQuery,
  });

  const { data: currentSupplyRaw, refetch: refetchSupply } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'currentSupply',
    args: [asset],
    query: commonQuery,
  });

  const { data: currentBorrowRaw, refetch: refetchBorrow } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'currentBorrow',
    args: [asset],
    query: commonQuery,
  });

  const { data: utilizationRaw, refetch: refetchUtilization } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'utilization',
    args: [asset],
    query: commonQuery,
  });

  const { data: poolCashRaw, refetch: refetchPoolCash } = useReadContract({
    address: asset,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [CONTRACT_ADDRESSES.lendingPool],
    query: commonQuery,
  });

  const { data: healthFactorRaw, refetch: refetchHealth } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'healthFactor',
    args: [address],
    query: walletQuery,
  });

  const { data: borrowPowerRaw, refetch: refetchBorrowPower } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'borrowPower',
    args: [address],
    query: walletQuery,
  });

  const globalDebtContracts = ACTIVE_MARKETS.flatMap((market) => [
    {
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'borrowBalance',
      args: [address, market.address],
    },
    {
      address: CONTRACT_ADDRESSES.oracle,
      abi: ORACLE_ABI,
      functionName: 'getPrice',
      args: [market.address],
    },
  ]);

  const {
    data: globalDebtResults,
    refetch: refetchGlobalDebt,
  } = useReadContracts({
    contracts: globalDebtContracts,
    query: walletQuery,
  });

  const selectedMarket = ACTIVE_MARKETS.find(
    (market) => market.address?.toLowerCase() === asset?.toLowerCase(),
  );

  const {
    data: selectedPriceResult,
    refetch: refetchSelectedPrice,
  } = useReadContract({
    address: CONTRACT_ADDRESSES.oracle,
    abi: ORACLE_ABI,
    functionName: 'getPrice',
    args: [asset],
    query: {
      enabled: configured && correctNetwork && Boolean(selectedMarket),
    },
  });

  const { data: walletBalanceRaw, refetch: refetchBalance } = useReadContract({
    address: asset,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    query: walletQuery,
  });

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: asset,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, CONTRACT_ADDRESSES.lendingPool],
    query: walletQuery,
  });

  const { writeContractAsync, isPending, error } = useWriteContract();

  const sendAndWait = async (request) => {
    if (!address) {
      throw new Error('Connect your wallet before submitting a transaction.');
    }
    if (chainId !== arcTestnet.id) {
      throw new Error('Switch your wallet to Arc Testnet before submitting a transaction.');
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
    } catch (caughtError) {
      setTransactionError(caughtError);
      throw caughtError;
    } finally {
      setTransactionPending(false);
    }
  };

  const approveAsset = (amount) => sendAndWait({
    address: asset,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [
      CONTRACT_ADDRESSES.lendingPool,
      parseUnits(String(amount), decimals),
    ],
  }).then(async (hash) => {
    await refetchAllowance();
    return hash;
  });

  const supply = (amount) => sendAndWait({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'supply',
    args: [asset, parseUnits(String(amount), decimals)],
  });

  const withdraw = (amount = 'max') => sendAndWait({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'withdraw',
    args: [
      asset,
      amount === 'max'
        ? MAX_UINT256
        : parseUnits(String(amount), decimals),
    ],
  });

  const borrow = (amount) => sendAndWait({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'borrow',
    args: [asset, parseUnits(String(amount), decimals)],
  });

  const repay = (amount = 'max') => sendAndWait({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'repay',
    args: [
      asset,
      amount === 'max'
        ? MAX_UINT256
        : parseUnits(String(amount), decimals),
    ],
  });

  const refetchAll = async () => {
    if (!correctNetwork) return;

    await Promise.all([
      refetchReserve(),
      refetchSupply(),
      refetchBorrow(),
      refetchUtilization(),
      refetchPoolCash(),
      refetchUserSupply(),
      refetchUserBorrow(),
      refetchHealth(),
      refetchBorrowPower(),
      refetchGlobalDebt(),
      refetchSelectedPrice(),
      refetchBalance(),
      refetchAllowance(),
    ]);
  };

  const walletBalance = formatDynamic(walletBalanceRaw, decimals);
  const supplyBalance = formatDynamic(supplyBalanceRaw, decimals);
  const borrowBalance = formatDynamic(borrowBalanceRaw, decimals);
  const allowance = formatDynamic(allowanceRaw, decimals);

  const healthIsInfinite =
    healthFactorRaw !== undefined &&
    healthFactorRaw >= MAX_UINT256 - 1000n;

  const healthFactorNumber =
    healthFactorRaw === undefined || healthIsInfinite
      ? null
      : Number(formatUnits(healthFactorRaw, 18));

  const healthFactor =
    healthFactorRaw === undefined
      ? '—'
      : healthIsInfinite
        ? '∞'
        : healthFactorNumber.toFixed(2);

  const healthFactorPercent =
    healthFactorRaw === undefined
      ? 0
      : healthIsInfinite
        ? 100
        : healthFactorNumber === null || !Number.isFinite(healthFactorNumber)
          ? 0
          : Math.round(
              Math.min(
                Math.max((1 - 1 / healthFactorNumber) * 100, 0),
                100,
              ),
            );

  let totalDebtValueRaw = ZERO;
  let globalDebtReady = Boolean(address) && Array.isArray(globalDebtResults);

  if (Array.isArray(globalDebtResults)) {
    for (let index = 0; index < ACTIVE_MARKETS.length; index += 1) {
      const borrowResult = globalDebtResults[index * 2];
      const priceResult = globalDebtResults[index * 2 + 1];
      const amountRaw = borrowResult?.result ?? ZERO;
      const market = ACTIVE_MARKETS[index];

      if (borrowResult?.status !== 'success') {
        globalDebtReady = false;
        continue;
      }

      if (amountRaw === ZERO) {
        continue;
      }

      if (priceResult?.status !== 'success') {
        globalDebtReady = false;
        continue;
      }

      const priceRaw = Array.isArray(priceResult.result)
        ? priceResult.result[0]
        : ZERO;

      if (priceRaw === ZERO) {
        globalDebtReady = false;
        continue;
      }

      totalDebtValueRaw +=
        (amountRaw * priceRaw) /
        (TEN ** BigInt(market.decimals));
    }
  }

  const totalBorrowPowerRaw = borrowPowerRaw ?? ZERO;
  const remainingBorrowPowerRaw =
    totalBorrowPowerRaw > totalDebtValueRaw
      ? totalBorrowPowerRaw - totalDebtValueRaw
      : ZERO;

  const totalBorrowPower = Number(formatUnits(totalBorrowPowerRaw, 18));
  const borrowLimit =
    globalDebtReady && Number.isFinite(totalBorrowPower)
      ? Number(formatUnits(remainingBorrowPowerRaw, 18))
      : 0;

  const selectedPriceRaw = Array.isArray(selectedPriceResult)
    ? selectedPriceResult[0]
    : ZERO;

  const riskLimitedBorrowRaw =
    globalDebtReady &&
    selectedPriceRaw > ZERO
      ? (remainingBorrowPowerRaw * (TEN ** BigInt(decimals))) /
        selectedPriceRaw
      : ZERO;

  const poolCashAmountRaw = poolCashRaw ?? ZERO;
  const maxBorrowRaw =
    riskLimitedBorrowRaw < poolCashAmountRaw
      ? riskLimitedBorrowRaw
      : poolCashAmountRaw;

  const maxBorrowAmount = formatUnits(maxBorrowRaw, decimals);
  const poolCash = formatDynamic(poolCashRaw, decimals);

  return {
    configured,
    correctNetwork,
    reserveLoading: reserveLoading || reserveFetching,
    reserveActive:
      reserveConfigRaw === undefined
        ? null
        : Boolean(reserveConfigRaw[0]),
    reserveConfig: reserveConfigRaw,
    walletBalance,
    supplyBalance,
    borrowBalance,
    allowance,
    reserveData: {
      totalLiquidity: poolCash,
      totalSupply: formatDynamic(currentSupplyRaw, decimals),
      totalBorrows: formatDynamic(currentBorrowRaw, decimals),
      utilization: Number(formatUnits(utilizationRaw ?? ZERO, 18)) * 100,
    },
    healthFactor,
    healthFactorPercent,
    borrowPower: totalBorrowPower.toFixed(2),
    borrowLimit: borrowLimit.toFixed(2),
    totalDebtValue: Number(formatUnits(totalDebtValueRaw, 18)).toFixed(2),
    maxBorrowAmount,
    approveAsset,
    supply,
    withdraw,
    borrow,
    repay,
    refetchAll,
    isPending: isPending || transactionPending,
    isConfirming: transactionPending && !isPending,
    isConfirmed:
      Boolean(transactionHash) &&
      !transactionPending &&
      !transactionError,
    txHash: transactionHash,
    error: transactionError || error,
  };
}
