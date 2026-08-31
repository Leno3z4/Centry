import { useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { formatUnits, maxUint256, parseUnits } from 'viem';
import { CONTRACT_ADDRESSES, hasAddress } from '../constants/contracts';
import { ERC20_ABI, LENDING_POOL_ABI } from '../constants/abis';
import { arcTestnet } from '../config/multiWagmi';

const ZERO = 0n;
const MAX_UINT256 = maxUint256;
const DEFAULT_ASSET = CONTRACT_ADDRESSES.USDC;
const DEFAULT_DECIMALS = 6;

export function useLendingPool(assetAddress = DEFAULT_ASSET, assetDecimals = DEFAULT_DECIMALS) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);
  const [transactionError, setTransactionError] = useState(null);

  const asset = assetAddress || DEFAULT_ASSET;
  const decimals = Number.isInteger(assetDecimals) ? assetDecimals : DEFAULT_DECIMALS;
  const configured = hasAddress('lendingPool') && /^0x[a-fA-F0-9]{40}$/.test(asset);
  const correctNetwork = !address || chainId === arcTestnet.id;
  const commonQuery = { enabled: configured && correctNetwork };
  const walletQuery = { enabled: configured && Boolean(address) && correctNetwork };

  const { data: reserveConfigRaw, refetch: refetchReserveConfig } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'getReserveConfig',
    args: [asset],
    query: commonQuery,
  });

  const { data: totalSupplyRaw, refetch: refetchSupply } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'currentSupply',
    args: [asset],
    query: commonQuery,
  });

  const { data: totalBorrowRaw, refetch: refetchBorrow } = useReadContract({
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

  // Health factor is account-wide in CentryLendingPool.
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
    if (!address) throw new Error('Connect your wallet before submitting a transaction.');
    if (chainId !== arcTestnet.id) throw new Error('Switch your wallet to Arc Testnet before submitting a transaction.');
    if (!publicClient) throw new Error('Wallet client is not ready. Please reconnect your wallet.');

    setTransactionPending(true);
    setTransactionError(null);

    try {
      const hash = await writeContractAsync(request);
      setTransactionHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The transaction was reverted onchain.');
      return hash;
    } catch (caughtError) {
      setTransactionError(caughtError);
      throw caughtError;
    } finally {
      setTransactionPending(false);
    }
  };

  const approveAsset = async (amount) => {
    const hash = await sendAndWait({
      address: asset,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.lendingPool, parseUnits(String(amount), decimals)],
    });
    await refetchAllowance();
    return hash;
  };

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
    args: [asset, amount === 'max' ? MAX_UINT256 : parseUnits(String(amount), decimals)],
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
    args: [asset, amount === 'max' ? MAX_UINT256 : parseUnits(String(amount), decimals)],
  });

  const refetchAll = async () => {
    if (!correctNetwork) return;
    await Promise.all([
      refetchReserveConfig(),
      refetchSupply(),
      refetchBorrow(),
      refetchUtilization(),
      refetchUserSupply(),
      refetchUserBorrow(),
      refetchHealth(),
      refetchBorrowPower(),
      refetchBalance(),
      refetchAllowance(),
    ]);
  };

  const formatAsset = (value) => formatUnits(value ?? ZERO, decimals);
  const format18 = (value) => formatUnits(value ?? ZERO, 18);
  const healthIsInfinite = healthFactorRaw !== undefined && healthFactorRaw >= MAX_UINT256 - 1000n;
  const healthFactorNumber = healthFactorRaw === undefined || healthIsInfinite ? null : Number(format18(healthFactorRaw));
  const healthFactor = healthFactorRaw === undefined ? '—' : healthIsInfinite ? '∞' : healthFactorNumber.toFixed(2);

  // Do not make the visual health depend on the currently selected market.
  // With no account debt, the contract returns uint256.max, which the UI maps to 100%.
  const healthFactorPercent =
    healthFactorRaw === undefined
      ? 0
      : healthIsInfinite
        ? 100
        : healthFactorNumber === null || !Number.isFinite(healthFactorNumber)
          ? 0
          : Math.round(Math.min(Math.max((1 - 1 / healthFactorNumber) * 100, 0), 100));

  const totalBorrowPower = Number(format18(borrowPowerRaw));
  const currentDebt = Number(formatAsset(borrowBalanceRaw));
  const borrowLimit = Number.isFinite(totalBorrowPower) ? Math.max(totalBorrowPower - currentDebt, 0) : 0;

  return {
    asset,
    decimals,
    configured,
    correctNetwork,
    reserveActive: reserveConfigRaw === undefined ? null : Boolean(reserveConfigRaw?.[0]),
    reserveConfig: reserveConfigRaw,
    reserveData: {
      totalLiquidity: formatAsset(totalSupplyRaw),
      totalBorrows: formatAsset(totalBorrowRaw),
      utilization: Number(format18(utilizationRaw)) * 100,
    },
    supplyBalance: formatAsset(supplyBalanceRaw),
    borrowBalance: formatAsset(borrowBalanceRaw),
    borrowPower: format18(borrowPowerRaw),
    borrowLimit: borrowLimit.toFixed(2),
    healthFactor,
    healthFactorPercent,
    walletBalance: formatAsset(walletBalanceRaw),
    allowance: formatAsset(allowanceRaw),
    rawAllowance: allowanceRaw ?? ZERO,
    approveAsset,
    supply,
    withdraw,
    borrow,
    repay,
    refetchAll,
    isPending: isPending || transactionPending,
    isConfirming: transactionPending && !isPending,
    isConfirmed: Boolean(transactionHash) && !transactionPending && !transactionError,
    txHash: transactionHash,
    error: transactionError || error,
    usdcBalance: formatAsset(walletBalanceRaw),
    usdcAllowance: formatAsset(allowanceRaw),
    rawUsdcAllowance: allowanceRaw ?? ZERO,
    approveUSDC: approveAsset,
  };
}
