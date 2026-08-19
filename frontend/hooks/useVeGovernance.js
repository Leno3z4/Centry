import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { VE_NFT_ABI, GAUGE_CONTROLLER_ABI, ERC20_ABI } from '../constants/abis';

export function useVeGovernance() {
  const { address } = useAccount();

  // Read veNFT balance for user
  const { data: veBalance, refetch: refetchVeBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.veNFT,
    abi: VE_NFT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Approve token to lock into veNFT
  const approveStakingToken = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.USYC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.veNFT, parsedAmount],
    });
  };

  // Lock tokens for veNFT
  const createLock = async (amount, unlockTimestamp) => {
    const parsedAmount = parseUnits(amount.toString(), 6);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.veNFT,
      abi: VE_NFT_ABI,
      functionName: 'createLock',
      args: [parsedAmount, BigInt(unlockTimestamp)],
    });
  };

  // Vote on Gauge Controller
  const voteForGauge = async (gaugeAddress, weight) => {
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.gaugeController,
      abi: GAUGE_CONTROLLER_ABI,
      functionName: 'voteForGaugeWeight',
      args: [gaugeAddress, BigInt(weight)],
    });
  };

  return {
    veBalance: veBalance ? veBalance.toString() : '0',
    approveStakingToken,
    createLock,
    voteForGauge,
    refetchVeBalance,
    isPending,
    isConfirming,
    isConfirmed,
    txHash: hash,
    error,
  };
}
