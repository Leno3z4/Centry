import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESSES, hasAddress } from '../constants/contracts';
import { VE_CENTRY_ABI, ERC20_ABI } from '../constants/abis';

export function useVeGovernance() {
  const { address } = useAccount();
  const ready = hasAddress('veCentry') && hasAddress('centryToken');
  const { data: nftBalance, refetch: refetchBalance } = useReadContract({ address: CONTRACT_ADDRESSES.veCentry, abi: VE_CENTRY_ABI, functionName: 'balanceOf', args: address && ready ? [address] : undefined, query: { enabled: !!address && ready } });
  const { data: tokenId } = useReadContract({ address: CONTRACT_ADDRESSES.veCentry, abi: VE_CENTRY_ABI, functionName: 'tokenIdOf', args: address && ready ? [address] : undefined, query: { enabled: !!address && ready } });
  const { data: power } = useReadContract({ address: CONTRACT_ADDRESSES.veCentry, abi: VE_CENTRY_ABI, functionName: 'votingPowerOf', args: address && ready ? [address] : undefined, query: { enabled: !!address && ready } });
  const { data: locked } = useReadContract({ address: CONTRACT_ADDRESSES.veCentry, abi: VE_CENTRY_ABI, functionName: 'lockedAmount', args: address && ready ? [address] : undefined, query: { enabled: !!address && ready } });
  const { data: lockEnd } = useReadContract({ address: CONTRACT_ADDRESSES.veCentry, abi: VE_CENTRY_ABI, functionName: 'lockEnd', args: address && ready ? [address] : undefined, query: { enabled: !!address && ready } });
  const { data: balance } = useReadContract({ address: CONTRACT_ADDRESSES.centryToken, abi: ERC20_ABI, functionName: 'balanceOf', args: address && hasAddress('centryToken') ? [address] : undefined, query: { enabled: !!address && hasAddress('centryToken') } });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({ address: CONTRACT_ADDRESSES.centryToken, abi: ERC20_ABI, functionName: 'allowance', args: address && ready ? [address, CONTRACT_ADDRESSES.veCentry] : undefined, query: { enabled: !!address && ready } });
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const approveCENT = (amount) => writeContractAsync({ address: CONTRACT_ADDRESSES.centryToken, abi: ERC20_ABI, functionName: 'approve', args: [CONTRACT_ADDRESSES.veCentry, parseUnits(amount.toString(), 18)] });
  const createLock = (amount, weeks) => writeContractAsync({ address: CONTRACT_ADDRESSES.veCentry, abi: VE_CENTRY_ABI, functionName: 'createLock', args: [parseUnits(amount.toString(), 18), BigInt(weeks) * 7n * 24n * 60n * 60n] });
  const increaseLock = (amount) => writeContractAsync({ address: CONTRACT_ADDRESSES.veCentry, abi: VE_CENTRY_ABI, functionName: 'increaseAmount', args: [parseUnits(amount.toString(), 18)] });
  const extendLock = (weeks) => writeContractAsync({ address: CONTRACT_ADDRESSES.veCentry, abi: VE_CENTRY_ABI, functionName: 'extendLock', args: [BigInt(weeks) * 7n * 24n * 60n * 60n] });

  return {
    configured: ready,
    veBalance: Number(nftBalance ?? 0n),
    tokenId: Number(tokenId ?? 0n),
    votingPower: formatUnits(power ?? 0n, 18),
    lockedAmount: formatUnits(locked ?? 0n, 18),
    lockEnd: lockEnd ? new Date(Number(lockEnd) * 1000) : null,
    centryBalance: formatUnits(balance ?? 0n, 18),
    centryAllowance: formatUnits(allowance ?? 0n, 18),
    approveCENT, createLock, increaseLock, extendLock,
    refetchAll: () => Promise.all([refetchBalance(), refetchAllowance()]),
    isPending, isConfirming, isConfirmed, txHash: hash, error,
  };
}
