import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESSES, hasAddress } from '../constants/contracts';
import { LENDING_POOL_ABI, ERC20_ABI } from '../constants/abis';

const enabled = (name) => hasAddress(name);
const zero = 0n;

export function useLendingPool() {
  const { address } = useAccount();
  const poolReady = enabled('lendingPool') && enabled('USDC');

  const { data: totalSupplyRaw, refetch: refetchSupply } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'currentSupply',
    args: poolReady ? [CONTRACT_ADDRESSES.USDC] : undefined,
    query: { enabled: poolReady },
  });
  const { data: totalBorrowRaw, refetch: refetchBorrow } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'currentBorrow',
    args: poolReady ? [CONTRACT_ADDRESSES.USDC] : undefined,
    query: { enabled: poolReady },
  });
  const { data: utilizationRaw, refetch: refetchUtilization } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'utilization',
    args: poolReady ? [CONTRACT_ADDRESSES.USDC] : undefined,
    query: { enabled: poolReady },
  });
  const { data: supplyBalanceRaw, refetch: refetchUserSupply } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'supplyBalance',
    args: address && poolReady ? [address, CONTRACT_ADDRESSES.USDC] : undefined,
    query: { enabled: !!address && poolReady },
  });
  const { data: borrowBalanceRaw, refetch: refetchUserBorrow } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'borrowBalance',
    args: address && poolReady ? [address, CONTRACT_ADDRESSES.USDC] : undefined,
    query: { enabled: !!address && poolReady },
  });
  const { data: healthFactorRaw, refetch: refetchHealth } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'healthFactor',
    args: address && enabled('lendingPool') ? [address] : undefined,
    query: { enabled: !!address && enabled('lendingPool') },
  });
  const { data: usdcBalanceRaw, refetch: refetchBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address && enabled('USDC') ? [address] : undefined,
    query: { enabled: !!address && enabled('USDC') },
  });
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && poolReady ? [address, CONTRACT_ADDRESSES.lendingPool] : undefined,
    query: { enabled: !!address && poolReady },
  });

  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const approveUSDC = (amount) => writeContractAsync({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [CONTRACT_ADDRESSES.lendingPool, parseUnits(amount.toString(), 6)],
  });
  const supply = (amount) => writeContractAsync({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'supply',
    args: [CONTRACT_ADDRESSES.USDC, parseUnits(amount.toString(), 6)],
  });
  const withdraw = (amount) => writeContractAsync({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'withdraw',
    args: [CONTRACT_ADDRESSES.USDC, parseUnits(amount.toString(), 6)],
  });
  const borrow = (amount) => writeContractAsync({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'borrow',
    args: [CONTRACT_ADDRESSES.USDC, parseUnits(amount.toString(), 6)],
  });
  const repay = (amount) => writeContractAsync({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'repay',
    args: [CONTRACT_ADDRESSES.USDC, parseUnits(amount.toString(), 6)],
  });

  const refetchAll = () => Promise.all([
    refetchSupply(), refetchBorrow(), refetchUtilization(), refetchUserSupply(),
    refetchUserBorrow(), refetchHealth(), refetchBalance(), refetchAllowance(),
  ]);

  const format6 = (v) => formatUnits(v ?? zero, 6);
  return {
    configured: poolReady,
    reserveData: { totalLiquidity: format6(totalSupplyRaw), totalBorrows: format6(totalBorrowRaw), utilization: `${Number(formatUnits(utilizationRaw ?? zero, 18)) * 100}` },
    supplyBalance: format6(supplyBalanceRaw),
    borrowBalance: format6(borrowBalanceRaw),
    healthFactor: healthFactorRaw === undefined ? '—' : healthFactorRaw === 0n || healthFactorRaw === undefined ? '∞' : Number(formatUnits(healthFactorRaw, 18)).toFixed(2),
    usdcBalance: format6(usdcBalanceRaw),
    usdcAllowance: format6(allowanceRaw),
    rawUsdcAllowance: allowanceRaw ?? zero,
    approveUSDC, supply, withdraw, borrow, repay, refetchAll,
    isPending, isConfirming, isConfirmed, txHash: hash, error,
  };
}
