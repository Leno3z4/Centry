import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { SELF_REPAYING_VAULT_ABI, ERC20_ABI } from '../constants/abis';

export function useSelfRepayingVault() {
  const { address } = useAccount();

  // Read user vault state (collateral, debt, maxBorrow)
  const { data: vaultData, refetch: refetchVault } = useReadContract({
    address: CONTRACT_ADDRESSES.selfRepayingVault,
    abi: SELF_REPAYING_VAULT_ABI,
    functionName: 'getVaultDetails',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Read USYC allowance for SelfRepayingVault
  const { data: usycAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.USYC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESSES.selfRepayingVault] : undefined,
    query: { enabled: !!address },
  });

  // Read USYC balance
  const { data: usycBalance, refetch: refetchUsycBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.USYC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Approve USYC spending
  const approveUSYC = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.USYC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.selfRepayingVault, parsedAmount],
    });
  };

  // Deposit USYC collateral
  const depositCollateral = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.selfRepayingVault,
      abi: SELF_REPAYING_VAULT_ABI,
      functionName: 'depositCollateral',
      args: [parsedAmount],
    });
  };

  // Withdraw USYC collateral
  const withdrawCollateral = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.selfRepayingVault,
      abi: SELF_REPAYING_VAULT_ABI,
      functionName: 'withdrawCollateral',
      args: [parsedAmount],
    });
  };

  // Borrow USDC credit against collateral
  const borrow = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.selfRepayingVault,
      abi: SELF_REPAYING_VAULT_ABI,
      functionName: 'borrow',
      args: [parsedAmount],
    });
  };

  // Repay USDC debt manually
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
  };

  return {
    vaultData: vaultData ? {
      collateral: formatUnits(vaultData[0] || 0n, 6),
      debt: formatUnits(vaultData[1] || 0n, 6),
      maxBorrow: formatUnits(vaultData[2] || 0n, 6),
      rawCollateral: vaultData[0],
      rawDebt: vaultData[1],
      rawMaxBorrow: vaultData[2],
    } : null,
    usycAllowance: usycAllowance ? formatUnits(usycAllowance, 6) : '0',
    rawUsycAllowance: usycAllowance || 0n,
    usycBalance: usycBalance ? formatUnits(usycBalance, 6) : '0',
    approveUSYC,
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
