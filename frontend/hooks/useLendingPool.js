import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits, maxUint256 } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { LENDING_POOL_ABI, ERC20_ABI } from '../constants/abis';

export function useLendingPool() {
  const { address } = useAccount();

  // FIX: getReserveData() takes NO args (old hook passed USDC address)
  const { data: reserveData, refetch: refetchReserve } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'getReserveData',
  });

  // User's current USDC supply value (not shares — human-readable)
  const { data: supplyBalanceRaw, refetch: refetchSupplyBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'supplyBalance',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // User's raw supply shares (needed for partial withdraw)
  const { data: supplySharesRaw, refetch: refetchShares } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'supplyShares',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESSES.lendingPool] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const approveUSDC = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.lendingPool, parsedAmount],
    });
  };

  // FIX: supply(uint256 amount) — 1 arg, no asset address, no referral code
  const depositLiquidity = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'supply',
      args: [parsedAmount],
    });
  };

  // FIX: withdraw(uint256 shares) — pass maxUint256 to withdraw everything
  const withdrawLiquidity = async () => {
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'withdraw',
      args: [maxUint256],
    });
  };

  const refetchAll = () => {
    refetchReserve();
    refetchUsdcBalance();
    refetchAllowance();
    refetchSupplyBalance();
    refetchShares();
  };

  return {
    // FIX: 4 return values, all WAD (1e18) not RAY (1e27)
    // [0] totalLiquidity, [1] totalBorrows, [2] borrowRatePerYear, [3] supplyRatePerYear
    reserveData: reserveData ? {
      totalLiquidity:  formatUnits(reserveData[0] || 0n, 6),
      totalBorrows:    formatUnits(reserveData[1] || 0n, 6),
      borrowRate:      formatUnits(reserveData[2] || 0n, 18),  // WAD annual rate
      supplyRate:      formatUnits(reserveData[3] || 0n, 18),  // WAD annual rate
    } : null,
    supplyBalance:    supplyBalanceRaw ? formatUnits(supplyBalanceRaw, 6) : '0',
    usdcBalance:      usdcBalance ? formatUnits(usdcBalance, 6) : '0',
    usdcAllowance:    usdcAllowance ? formatUnits(usdcAllowance, 6) : '0',
    rawUsdcAllowance: usdcAllowance || 0n,
    approveUSDC,
    depositLiquidity,
    withdrawLiquidity,
    refetchAll,
    isPending,
    isConfirming,
    isConfirmed,
    txHash: hash,
    error,
  };
}
