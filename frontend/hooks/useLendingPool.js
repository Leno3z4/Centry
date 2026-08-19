import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { LENDING_POOL_ABI, ERC20_ABI } from '../constants/abis';

export function useLendingPool() {
  const { address } = useAccount();

  // Read USDC reserve data from LendingPool
  const { data: reserveData, refetch: refetchReserve } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'getReserveData',
    args: [CONTRACT_ADDRESSES.USDC],
  });

  // Read user USDC balance
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read user USDC allowance for LendingPool
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESSES.lendingPool] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Approve USDC spending for LendingPool
  const approveUSDC = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.lendingPool, parsedAmount],
    });
  };

  // Supply USDC to LendingPool
  const depositLiquidity = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'deposit',
      args: [CONTRACT_ADDRESSES.USDC, parsedAmount, address, 0],
    });
  };

  // Withdraw USDC from LendingPool
  const withdrawLiquidity = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'withdraw',
      args: [CONTRACT_ADDRESSES.USDC, parsedAmount, address],
    });
  };

  const refetchAll = () => {
    refetchReserve();
    refetchUsdcBalance();
    refetchAllowance();
  };

  return {
    reserveData: reserveData ? {
      totalLiquidity: formatUnits(reserveData[0] || 0n, 6),
      totalBorrows: formatUnits(reserveData[1] || 0n, 6),
      currentLiquidityRate: formatUnits(reserveData[2] || 0n, 27),
    } : null,
    usdcBalance: usdcBalance ? formatUnits(usdcBalance, 6) : '0',
    usdcAllowance: usdcAllowance ? formatUnits(usdcAllowance, 6) : '0',
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
