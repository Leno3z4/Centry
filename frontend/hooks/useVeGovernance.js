import { useState } from 'react';
import { useAccount, useChainId, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESSES, hasAddress } from '../constants/contracts';
import { VE_CENTRY_ABI, ERC20_ABI } from '../constants/abis';
import { arcTestnet } from '../config/wagmi';

export function useVeGovernance() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);
  const [transactionError, setTransactionError] = useState(null);

  const configured = hasAddress('veCentry') && hasAddress('centryToken');
  const correctNetwork = !address || chainId === arcTestnet.id;

  const { data: veBalance, refetch: refetchVeBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentry,
    abi: VE_CENTRY_ABI,
    functionName: 'balanceOf',
    args: address && configured ? [address] : undefined,
    query: { enabled: !!address && configured && correctNetwork },
  });

  const { data: tokenId } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentry,
    abi: VE_CENTRY_ABI,
    functionName: 'tokenIdOf',
    args: address && configured ? [address] : undefined,
    query: { enabled: !!address && configured && correctNetwork },
  });

  const { data: votingPower } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentry,
    abi: VE_CENTRY_ABI,
    functionName: 'votingPowerOf',
    args: address && configured ? [address] : undefined,
    query: { enabled: !!address && configured && correctNetwork },
  });

  const { data: lockedAmount } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentry,
    abi: VE_CENTRY_ABI,
    functionName: 'lockedAmount',
    args: address && configured ? [address] : undefined,
    query: { enabled: !!address && configured && correctNetwork },
  });

  const { data: lockEnd } = useReadContract({
    address: CONTRACT_ADDRESSES.veCentry,
    abi: VE_CENTRY_ABI,
    functionName: 'lockEnd',
    args: address && configured ? [address] : undefined,
    query: { enabled: !!address && configured && correctNetwork },
  });

  const { data: centBalance, refetch: refetchCentBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.centryToken,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address && hasAddress('centryToken') ? [address] : undefined,
    query: { enabled: !!address && hasAddress('centryToken') && correctNetwork },
  });

  const { data: centAllowance, refetch: refetchCentAllowance } = useReadContract({
    address: CONTRACT_ADDRESSES.centryToken,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && configured ? [address, CONTRACT_ADDRESSES.veCentry] : undefined,
    query: { enabled: !!address && configured && correctNetwork },
  });

  const { writeContractAsync, isPending, error } = useWriteContract();

  const sendAndWait = async (request) => {
    if (!address) {
      throw new Error('Connect your wallet before submitting a transaction.');
    }

    if (chainId !== arcTestnet.id) {
      throw new Error('Switch your wallet to Arc Testnet before submitting a transaction.');
    }

    if (!publicClient) {
      throw new Error('Wallet client is not ready. Please reconnect your wallet.');
    }

    setTransactionPending(true);
    setTransactionError(null);

    try {
      const hash = await writeContractAsync(request);
      setTransactionHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== 'success') {
        throw new Error('The transaction was reverted onchain.');
      }

      return hash;
    } catch (caughtError) {
      setTransactionError(caughtError);
      throw caughtError;
    } finally {
      setTransactionPending(false);
    }
  };

  const approveCENT = async (amount) => {
    const hash = await sendAndWait({
      address: CONTRACT_ADDRESSES.centryToken,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.veCentry, parseUnits(amount.toString(), 18)],
    });

    await refetchCentAllowance();
    return hash;
  };

  const createLock = (amount, weeks) => sendAndWait({
    address: CONTRACT_ADDRESSES.veCentry,
    abi: VE_CENTRY_ABI,
    functionName: 'createLock',
    args: [parseUnits(amount.toString(), 18), BigInt(weeks) * 7n * 24n * 60n * 60n],
  });

  const increaseLock = (amount) => sendAndWait({
    address: CONTRACT_ADDRESSES.veCentry,
    abi: VE_CENTRY_ABI,
    functionName: 'increaseAmount',
    args: [parseUnits(amount.toString(), 18)],
  });

  const extendLock = (weeks) => sendAndWait({
    address: CONTRACT_ADDRESSES.veCentry,
    abi: VE_CENTRY_ABI,
    functionName: 'extendLock',
    args: [BigInt(weeks) * 7n * 24n * 60n * 60n],
  });

  const refetchAll = () => Promise.all([
    refetchVeBalance(),
    refetchCentBalance(),
    refetchCentAllowance(),
  ]);

  return {
    configured,
    correctNetwork,
    veBalance: Number(veBalance ?? 0n),
    tokenId: Number(tokenId ?? 0n),
    votingPower: formatUnits(votingPower ?? 0n, 18),
    lockedAmount: formatUnits(lockedAmount ?? 0n, 18),
    lockEnd: lockEnd ? new Date(Number(lockEnd) * 1000) : null,
    centBalance: formatUnits(centBalance ?? 0n, 18),
    centAllowance: formatUnits(centAllowance ?? 0n, 18),
    approveCENT,
    createLock,
    increaseLock,
    extendLock,
    refetchAll,
    isPending: isPending || transactionPending,
    isConfirming: transactionPending && !isPending,
    isConfirmed: Boolean(transactionHash) && !transactionPending && !transactionError,
    txHash: transactionHash,
    error: transactionError || error,
  };
}
