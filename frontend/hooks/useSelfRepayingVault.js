import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { SELF_REPAYING_VAULT_ABI, ERC20_ABI } from '../constants/abis';

export function useSelfRepayingVault() {
  const { address } = useAccount();

  // FIX: function is getPosition() not getVaultDetails()
  // FIX: returns 4 values — (collateral, debt, maxBorrow, healthFactor)
  const { data: vaultData, refetch: refetchVault } = useReadContract({
    address: CONTRACT_ADDRESSES.selfRepayingVault,
    abi: SELF_REPAYING_VAULT_ABI,
    functionName: 'getPosition',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usycAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.USYC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESSES.selfRepayingVault] : undefined,
    query: { enabled: !!address },
  });

  const { data: usycBalance, refetch: refetchUsycBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.USYC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // USDC balance for repay
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESSES.selfRepayingVault] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const approveUSYC = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.USYC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.selfRepayingVault, parsedAmount],
    });
  };

  const approveUSDCForRepay = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.selfRepayingVault, parsedAmount],
    });
  };

  const depositCollateral = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.selfRepayingVault,
      abi: SELF_REPAYING_VAULT_ABI,
      functionName: 'depositCollateral',
      args: [parsedAmount],
    });
  };

  const withdrawCollateral = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.selfRepayingVault,
      abi: SELF_REPAYING_VAULT_ABI,
      functionName: 'withdrawCollateral',
      args: [parsedAmount],
    });
  };

  const borrow = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.selfRepayingVault,
      abi: SELF_REPAYING_VAULT_ABI,
      functionName: 'borrow',
      args: [parsedAmount],
    });
  };

  const repay = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.selfRepayingVault,
      abi: SELF_REPAYING_VAULT_ABI,
      functionName: 'repay',
      args: [parsedAmount],
    });
  };

  const refetchAll = () => {
    refetchVault();
    refetchAllowance();
    refetchUsycBalance();
    refetchUsdcBalance();
    refetchUsdcAllowance();
  };

  // Health factor: 1e18 = healthy, below = liquidatable
  const hfRaw = vaultData?.[3] || 0n;
  const hfNum = Number(formatUnits(hfRaw, 18));
  const healthStatus = hfRaw === BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    ? 'Safe'
    : hfNum >= 1.5 ? 'Safe'
    : hfNum >= 1.1 ? 'Caution'
    : 'At Risk';

  return {
    vaultData: vaultData ? {
      collateral:    formatUnits(vaultData[0] || 0n, 6),
      debt:          formatUnits(vaultData[1] || 0n, 6),
      maxBorrow:     formatUnits(vaultData[2] || 0n, 6),
      healthFactor:  hfNum >= 1e15 ? '∞' : hfNum.toFixed(2), // FIX: 4th return value
      healthStatus,
      rawCollateral: vaultData[0],
      rawDebt:       vaultData[1],
      rawMaxBorrow:  vaultData[2],
    } : null,
    usycAllowance:    usycAllowance ? formatUnits(usycAllowance, 6) : '0',
    rawUsycAllowance: usycAllowance || 0n,
    usdcAllowance:    usdcAllowance ? formatUnits(usdcAllowance, 6) : '0',
    rawUsdcAllowance: usdcAllowance || 0n,
    usycBalance:      usycBalance ? formatUnits(usycBalance, 6) : '0',
    usdcBalance:      usdcBalance ? formatUnits(usdcBalance, 6) : '0',
    approveUSYC,
    approveUSDCForRepay,
    depositCollateral,
    withdrawCollateral,
    borrow,
    repay,
    refetchAll,
    isPending,
    isConfirming,
    isConfirmed,
    txHash: hash,
    error,
  };
}
