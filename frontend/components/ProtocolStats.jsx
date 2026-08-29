'use client';

import React from 'react';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { LENDING_POOL_ABI } from '../constants/abis';

const factoryAbi = [
  {
    type: 'function',
    name: 'allPositionsLength',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
];

const formatUsdc = (value) => {
  if (value === undefined) return '—';
  const amount = Number(formatUnits(value, 6));
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(amount);
};

export default function ProtocolStats() {
  const enabled = Boolean(CONTRACT_ADDRESSES.lendingPool && CONTRACT_ADDRESSES.USDC);

  const { data: supply } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'currentSupply',
    args: [CONTRACT_ADDRESSES.USDC],
    query: { enabled },
  });

  const { data: borrow } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'currentBorrow',
    args: [CONTRACT_ADDRESSES.USDC],
    query: { enabled },
  });

  const { data: positions } = useReadContract({
    address: CONTRACT_ADDRESSES.selfRepayingFactory,
    abi: factoryAbi,
    functionName: 'allPositionsLength',
    query: { enabled: Boolean(CONTRACT_ADDRESSES.selfRepayingFactory) },
  });

  const supplyNumber = supply === undefined ? null : Number(formatUnits(supply, 6));
  const borrowNumber = borrow === undefined ? null : Number(formatUnits(borrow, 6));
  const utilization = supplyNumber && supplyNumber > 0
    ? `${((borrowNumber / supplyNumber) * 100).toFixed(2)}%`
    : supplyNumber === 0
      ? '0.00%'
      : '—';

  return (
    <section className="protocol-stats" aria-label="Live Centry protocol statistics">
      <div className="protocol-stats-heading">
        <span className="section-kicker">LIVE PROTOCOL DATA</span>
        <span className="protocol-stats-live"><i /> Onchain</span>
      </div>
      <div className="protocol-stats-grid">
        <article className="protocol-stat">
          <span>Total supplied</span>
          <strong>{formatUsdc(supply)} <small>mUSDC</small></strong>
          <em>Current liquidity</em>
        </article>
        <article className="protocol-stat">
          <span>Total borrowed</span>
          <strong>{formatUsdc(borrow)} <small>mUSDC</small></strong>
          <em>Outstanding debt</em>
        </article>
        <article className="protocol-stat">
          <span>Utilization</span>
          <strong>{utilization}</strong>
          <em>Borrowed / supplied</em>
        </article>
        <article className="protocol-stat">
          <span>Self-repaying positions</span>
          <strong>{positions === undefined ? '—' : positions.toString()}</strong>
          <em>Created by the factory</em>
        </article>
      </div>
    </section>
  );
}
