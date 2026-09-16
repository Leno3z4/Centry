'use client';

import { useEffect, useRef } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { LENDING_POOL_ABI } from '../constants/abis';

const POSITION_EVENTS = [
  { name: 'Supplied', key: 'user' },
  { name: 'Withdrawn', key: 'user' },
  { name: 'Borrowed', key: 'user' },
  { name: 'Repaid', key: 'borrower' },
  { name: 'Liquidated', key: 'borrower' },
];

export function useCentryPositionEvents(onPositionChanged) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const callbackRef = useRef(onPositionChanged);

  useEffect(() => {
    callbackRef.current = onPositionChanged;
  }, [onPositionChanged]);

  useEffect(() => {
    if (!address || !publicClient?.watchContractEvent || !CONTRACT_ADDRESSES.lendingPool) return undefined;

    const unwatchers = POSITION_EVENTS.map(({ name, key }) => publicClient.watchContractEvent({
      address: CONTRACT_ADDRESSES.lendingPool,
      abi: LENDING_POOL_ABI,
      eventName: name,
      args: { [key]: address },
      onLogs: () => callbackRef.current?.(name),
      poll: true,
      pollingInterval: 2000,
    }));

    return () => {
      unwatchers.forEach((unwatch) => {
        try { unwatch?.(); } catch { /* noop */ }
      });
    };
  }, [address, publicClient]);
}
