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

export function useLendingPool() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);
  const [transactionError, setTransactionError] = useState(null);

  const configured = hasAddress('lendingPool') && hasAddress('usdc');
  const correctNetwork = !address || chainId === arcTestnet.id;

  const { data: usdcBalanceRaw, refetch: refetchUsdcBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && configured && correctNetwork),
    },
  });

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.usdc,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESSES.lendingPool] : undefined,
    query: {
      enabled: Boolean(address && configured && correctNetwork),
    },
  });

  const { data: supplyBalanceRaw, refetch: refetchSupplyBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'supplyBalance',
    args: address ? [address, CONTRACT_ADDRESSES.usdc] : undefined,
    query: {
      enabled: Boolean(address && configured && correctNetwork),
    },
  });

  const { data: borrowBalanceRaw, refetch: refetchBorrowBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'borrowBalance',
    args: address ? [address, CONTRACT_ADDRESSES.usdc] : undefined,
    query: {
      enabled: Boolean(address && configured && correctNetwork),
    },
  });

  const { data: healthFactorRaw, refetch: refetchHealthFactor } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'healthFactor',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && configured && correctNetwork),
    },
  });

  const { data: borrowPowerRaw, refetch: refetchBorrowPower } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'borrowPower',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && configured && correctNetwork),
    },
  });

  const { data: reserveDataRaw, refetch: refetchReserveData } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'getReserveData',
    args: [CONTRACT_ADDRESSES.usdc],
    query: {
      enabled: Boolean(configured && correctNetwork),
    },
  });

  const { writeContractAsync } = useWriteContract();

  const executeTransaction = async (request) => {
    if (!address) throw new Error('Connect your wallet first.');
    if (!correctNetwork) throw new Error('Switch to Arc Testnet first.');
    if (!configured) throw new Error('Centry contracts are not configured.');

    setTransactionPending(true);
    setTransactionError(null);

    try {
      const hash = await writeContractAsync(request);
      setTransactionHash(hash);

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
        });

        if (receipt.status !== 'success') {
          throw new Error('The transaction was reverted onchain.');
        }
      }

      return hash;
    } catch (error) {
      setTransactionError(error);
      throw error;
    } finally {
      setTransactionPending(false);
    }
  };

  const parseAmount = (amount) => {
    const value = String(amount ?? '').trim();
    if (!value || Number(value) <= 0) {
      throw new Error('Enter an amount greater than zero.');
    }
    return parseUnits(value, 6);
  };

  const approveUSDC = async (amount) => {
    const parsed = parseAmount(amount);
    return executeTransaction({
      address: CONTRACT_ADDRESSES.usdc,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.lendingPool, parsed],
    });
  };

  const supply = async (amount) => {
    const parsed = parseAmount(amount);
    return executeTransaction({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'supply',
      args: [CONTRACT_ADDRESSES.usdc, parsed],
    });
  };

  const withdraw = async (amount) => {
    const parsed = parseAmount(amount);
    return executeTransaction({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'withdraw',
      args: [CONTRACT_ADDRESSES.usdc, parsed],
    });
  };

  const borrow = async (amount) => {
    const parsed = parseAmount(amount);
    return executeTransaction({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'borrow',
      args: [CONTRACT_ADDRESSES.usdc, parsed],
    });
  };

  const repay = async (amount) => {
    const parsed = parseAmount(amount);
    return executeTransaction({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      functionName: 'repay',
      args: [CONTRACT_ADDRESSES.usdc, parsed],
    });
  };

  const refetchAll = async () => {
    await Promise.all([
      refetchUsdcBalance(),
      refetchAllowance(),
      refetchSupplyBalance(),
      refetchBorrowBalance(),
      refetchHealthFactor(),
      refetchBorrowPower(),
      refetchReserveData(),
    ]);
  };

  return {
    usdcBalance: usdcBalanceRaw === undefined ? '0' : formatUnits(usdcBalanceRaw, 6),
    usdcAllowance: allowanceRaw === undefined ? '0' : formatUnits(allowanceRaw, 6),
    supplyBalance: supplyBalanceRaw === undefined ? '0' : formatUnits(supplyBalanceRaw, 6),
    borrowBalance: borrowBalanceRaw === undefined ? '0' : formatUnits(borrowBalanceRaw, 6),
    healthFactor:
      healthFactorRaw === undefined
        ? '—'
        : healthFactorRaw === MAX_UINT256
          ? '∞'
          : formatUnits(healthFactorRaw, 18),
    borrowPower: borrowPowerRaw === undefined ? '0' : formatUnits(borrowPowerRaw, 6),
    reserveData: reserveDataRaw
      ? {
          totalLiquidity: formatUnits(reserveDataRaw[0] ?? ZERO, 6),
          totalBorrows: formatUnits(reserveDataRaw[1] ?? ZERO, 6),
          utilization: formatUnits(reserveDataRaw[2] ?? ZERO, 18),
        }
      : null,
    isPending: transactionPending,
    isConfirming: false,
    error: transactionError,
    transactionHash,
    approveUSDC,
    supply,
    withdraw,
    borrow,
    repay,
    refetchAll,
  };
}
