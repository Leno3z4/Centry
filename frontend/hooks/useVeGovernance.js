import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { VE_NFT_ABI, GAUGE_CONTROLLER_ABI, ERC20_ABI } from '../constants/abis';

export function useVeGovernance() {
  const { address } = useAccount();

  // Number of veNFTs owned
  const { data: veBalance, refetch: refetchVeBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.veNFT,
    abi: VE_NFT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Next token ID (to find what IDs exist: 1 to nextTokenId-1)
  const { data: nextTokenId } = useReadContract({
    address: CONTRACT_ADDRESSES.veNFT,
    abi: VE_NFT_ABI,
    functionName: 'nextTokenId',
  });

  // FIX: approve CNTRY (not USYC) to VeNFT
  // FIX: CNTRY has 18 decimals (not 6)
  const { data: cntryAllowance, refetch: refetchCntryAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.cntryToken,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESSES.veNFT] : undefined,
    query: { enabled: !!address },
  });

  const { data: cntryBalance, refetch: refetchCntryBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.cntryToken,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // FIX: approve CNTRY (18 decimals) to VeNFT
  const approveCNTRY = async (amount) => {
    const parsedAmount = parseUnits(amount.toString(), 18);
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.cntryToken,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.veNFT, parsedAmount],
    });
  };

  // FIX: createLock takes DURATION in seconds, not absolute timestamp
  // FIX: CNTRY has 18 decimals
  const createLock = async (amount, durationWeeks) => {
    const parsedAmount = parseUnits(amount.toString(), 18);
    const durationSeconds = BigInt(durationWeeks) * 7n * 24n * 3600n;
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.veNFT,
      abi: VE_NFT_ABI,
      functionName: 'createLock',
      args: [parsedAmount, durationSeconds],
    });
  };

  // FIX: vote(tokenId, gauge, weight) — was voteForGaugeWeight(gauge, weight)
  // FIX: tokenId is required — which NFT is voting
  const voteForGauge = async (tokenId, gaugeAddress, weight) => {
    return await writeContractAsync({
      address: CONTRACT_ADDRESSES.gaugeController,
      abi: GAUGE_CONTROLLER_ABI,
      functionName: 'vote',
      args: [BigInt(tokenId), gaugeAddress, BigInt(weight)],
    });
  };

  // Get position details for a specific tokenId
  const getTokenPosition = (tokenId) => useReadContract({
    address: CONTRACT_ADDRESSES.veNFT,
    abi: VE_NFT_ABI,
    functionName: 'getPosition',
    args: [BigInt(tokenId)],
    query: { enabled: tokenId > 0 },
  });

  const refetchAll = () => {
    refetchVeBalance();
    refetchCntryAllowance();
    refetchCntryBalance();
  };

  return {
    veBalance:        veBalance ? Number(veBalance) : 0,
    nextTokenId:      nextTokenId ? Number(nextTokenId) : 1,
    cntryBalance:     cntryBalance ? formatUnits(cntryBalance, 18) : '0',
    cntryAllowance:   cntryAllowance ? formatUnits(cntryAllowance, 18) : '0',
    rawCntryAllowance: cntryAllowance || 0n,
    approveCNTRY,
    createLock,
    voteForGauge,
    getTokenPosition,
    refetchAll,
    isPending,
    isConfirming,
    isConfirmed,
    txHash: hash,
    error,
  };
}
