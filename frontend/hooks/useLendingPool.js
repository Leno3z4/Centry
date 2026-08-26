import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import {
  formatUnits,
  maxUint256,
  parseUnits,
} from 'viem';
import {
  CONTRACT_ADDRESSES,
  hasAddress,
} from '../constants/contracts';
import {
  ERC20_ABI,
  LENDING_POOL_ABI,
} from '../constants/abis';

const ZERO = 0n;
const MAX_UINT256 = maxUint256;

export function useLendingPool() {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const configured =
    hasAddress('lendingPool') &&
    hasAddress('USDC');

  const commonQuery = {
    enabled: configured,
  };

  const walletQuery = {
    enabled: configured && Boolean(address),
  };

  const { data: totalSupplyRaw, refetch: refetchSupply } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'currentSupply',
    args: [CONTRACT_ADDRESSES.USDC],
    query: commonQuery,
  });

  const { data: totalBorrowRaw, refetch: refetchBorrow } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'currentBorrow',
    args: [CONTRACT_ADDRESSES.USDC],
    query: commonQuery,
  });

  const { data: utilizationRaw, refetch: refetchUtilization } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'utilization',
    args: [CONTRACT_ADDRESSES.USDC],
    query: commonQuery,
  });

  const { data: supplyBalanceRaw, refetch: refetchUserSupply } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'supplyBalance',
    args: [address, CONTRACT_ADDRESSES.USDC],
    query: walletQuery,
  });

  const { data: borrowBalanceRaw, refetch: refetchUserBorrow } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'borrowBalance',
    args: [address, CONTRACT_ADDRESSES.USDC],
    query: walletQuery,
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

  const { data: usdcBalanceRaw, refetch: refetchBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    query: {
      enabled: Boolean(address) && hasAddress('USDC'),
    },
  });

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, CONTRACT_ADDRESSES.lendingPool],
    query: walletQuery,
  });

  const {
    writeContractAsync,
    isPending,
    error,
  } = useWriteContract();

  const sendAndWait = async (request) => {
    if (!publicClient) {
      throw new Error('Wallet client is not ready. Please reconnect your wallet.');
    }

    const hash = await writeContractAsync(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('The transaction was reverted onchain.');
    }

    return hash;
  };

  const approveUSDC = (amount) => sendAndWait({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [
      CONTRACT_ADDRESSES.lendingPool,
      parseUnits(String(amount), 6),
    ],
  });

  const supply = (amount) => sendAndWait({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'supply',
    args: [
      CONTRACT_ADDRESSES.USDC,
      parseUnits(String(amount), 6),
    ],
  });

  const withdraw = (amount = 'max') => sendAndWait({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'withdraw',
    args: [
      CONTRACT_ADDRESSES.USDC,
      amount === 'max'
        ? MAX_UINT256
        : parseUnits(String(amount), 6),
    ],
  });

  const borrow = (amount) => sendAndWait({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'borrow',
    args: [
      CONTRACT_ADDRESSES.USDC,
      parseUnits(String(amount), 6),
    ],
  });

  const repay = (amount = 'max') => sendAndWait({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'repay',
    args: [
      CONTRACT_ADDRESSES.USDC,
      amount === 'max'
        ? MAX_UINT256
        : parseUnits(String(amount), 6),
    ],
  });

  const refetchAll = async () => {
    await Promise.all([
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

  const format6 = (value) => formatUnits(value ?? ZERO, 6);
  const format18 = (value) => formatUnits(value ?? ZERO, 18);

  const healthFactor =
    healthFactorRaw === undefined
      ? '—'
      : healthFactorRaw >= MAX_UINT256 - 1000n
        ? '∞'
        : Number(format18(healthFactorRaw)).toFixed(2);

  return {
    configured,
    reserveData: {
      totalLiquidity: format6(totalSupplyRaw),
      totalBorrows: format6(totalBorrowRaw),
      utilization: Number(format18(utilizationRaw)) * 100,
    },
    supplyBalance: format6(supplyBalanceRaw),
    borrowBalance: format6(borrowBalanceRaw),
    borrowPower: format18(borrowPowerRaw),
    healthFactor,
    usdcBalance: format6(usdcBalanceRaw),
    usdcAllowance: format6(allowanceRaw),
    rawUsdcAllowance: allowanceRaw ?? ZERO,
    approveUSDC,
    supply,
    withdraw,
    borrow,
    repay,
    refetchAll,
    isPending,
    isConfirming: false,
    isConfirmed: false,
    txHash: null,
    error,
  };
}
