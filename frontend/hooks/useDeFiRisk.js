import { useMemo } from 'react';
import { useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi';
import { formatUnits, maxUint256 } from 'viem';
import { arcMainnet } from '../config/multiWagmi';
import { ACTIVE_MARKETS } from '../constants/markets';
import { CONTRACT_ADDRESSES } from '../constants/contracts';
import { ERC20_ABI, LENDING_POOL_ABI, ORACLE_ABI } from '../constants/abis';
import { buildRiskSummary, supplyApyFromBorrowRate, liquidationPriceForCollateral } from '../lib/defiRisk';

const STRATEGY_ABI = [
  { type: 'function', name: 'getBorrowRate', stateMutability: 'view', inputs: [{ name: 'utilization', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
];

const BALANCE_ABI = ERC20_ABI;

function safeUnits(value, decimals) {
  try {
    return Number(formatUnits(value ?? 0n, decimals));
  } catch {
    return 0;
  }
}

function safePrice(value) {
  try {
    return Number(formatUnits(value ?? 0n, 18));
  } catch {
    return 0;
  }
}

export function useDeFiRisk() {
  const { address } = useAccount();
  const chainId = useChainId();
  const enabled = chainId === arcMainnet.id;

  const marketContracts = useMemo(
    () => ACTIVE_MARKETS.flatMap((market) => [
      { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'getReserveConfig', args: [market.address] },
      { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'currentSupply', args: [market.address] },
      { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'currentBorrow', args: [market.address] },
      { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'utilization', args: [market.address] },
      { address: market.address, abi: BALANCE_ABI, functionName: 'balanceOf', args: [CONTRACT_ADDRESSES.lendingPool] },
      { address: CONTRACT_ADDRESSES.oracle, abi: ORACLE_ABI, functionName: 'getPrice', args: [market.address] },
      { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'supplyBalance', args: [address, market.address] },
      { address: CONTRACT_ADDRESSES.lendingPool, abi: LENDING_POOL_ABI, functionName: 'borrowBalance', args: [address, market.address] },
    ]),
    [address],
  );

  const { data: healthFactorRaw, isLoading: healthLoading } = useReadContract({
    address: CONTRACT_ADDRESSES.lendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'healthFactor',
    args: [address],
    query: { enabled: enabled && Boolean(address) },
  });

  const { data: marketResults, isLoading: marketLoading } = useReadContracts({
    contracts: marketContracts,
    query: { enabled: enabled && Boolean(address) },
  });

  const rateContracts = useMemo(
    () => ACTIVE_MARKETS.map((market, index) => ({
      address: CONTRACT_ADDRESSES.interestRateModel,
      abi: STRATEGY_ABI,
      functionName: 'getBorrowRate',
      args: [marketResults?.[index * 8 + 3]?.status === 'success' ? marketResults[index * 8 + 3].result : 0n],
    })),
    [marketResults],
  );

  const { data: rateResults, isLoading: rateLoading } = useReadContracts({
    contracts: rateContracts,
    query: { enabled: enabled && Boolean(marketResults?.length) },
  });

  const markets = useMemo(() => ACTIVE_MARKETS.map((market, index) => {
    const offset = index * 8;
    const config = marketResults?.[offset]?.status === 'success' ? marketResults[offset].result : undefined;
    const supplyRaw = marketResults?.[offset + 1]?.status === 'success' ? marketResults[offset + 1].result : 0n;
    const borrowRaw = marketResults?.[offset + 2]?.status === 'success' ? marketResults[offset + 2].result : 0n;
    const utilizationRaw = marketResults?.[offset + 3]?.status === 'success' ? marketResults[offset + 3].result : 0n;
    const cashRaw = marketResults?.[offset + 4]?.status === 'success' ? marketResults[offset + 4].result : 0n;
    const priceResult = marketResults?.[offset + 5]?.status === 'success' ? marketResults[offset + 5].result : null;
    const suppliedRaw = marketResults?.[offset + 6]?.status === 'success' ? marketResults[offset + 6].result : 0n;
    const borrowedRaw = marketResults?.[offset + 7]?.status === 'success' ? marketResults[offset + 7].result : 0n;

    const priceE18 = Array.isArray(priceResult) ? priceResult[0] : 0n;
    const priceUsd = safePrice(priceE18);
    const suppliedUsd = safeUnits(suppliedRaw, market.decimals) * priceUsd;
    const borrowedUsd = safeUnits(borrowedRaw, market.decimals) * priceUsd;
    const utilization = safeUnits(utilizationRaw, 18);
    const reserveFactorBps = Number(config?.[5] || 0);
    const borrowApyRaw = rateResults?.[index];
    const borrowApy = borrowApyRaw?.status === 'success'
      ? safeUnits(borrowApyRaw.result, 18) * 100
      : 0;
    const supplyApy = supplyApyFromBorrowRate(borrowApy, utilization, reserveFactorBps);

    return {
      ...market,
      active: Boolean(config?.[0]),
      ltvBps: Number(config?.[2] || 0),
      liquidationThresholdBps: Number(config?.[3] || 0),
      liquidationBonusBps: Number(config?.[4] || 0),
      reserveFactorBps,
      supplyCap: safeUnits(config?.[6] || 0n, market.decimals),
      borrowCap: safeUnits(config?.[7] || 0n, market.decimals),
      supplyCapUtilizationPct: Number(config?.[6] || 0n) > 0
        ? (Number(supplyRaw) / Number(config[6])) * 100
        : 0,
      borrowCapUtilizationPct: Number(config?.[7] || 0n) > 0
        ? (Number(borrowRaw) / Number(config[7])) * 100
        : 0,
      currentSupply: safeUnits(supplyRaw, market.decimals),
      currentBorrow: safeUnits(borrowRaw, market.decimals),
      cash: safeUnits(cashRaw, market.decimals),
      utilizationPct: utilization * 100,
      priceUsd,
      supplied: safeUnits(suppliedRaw, market.decimals),
      borrowed: safeUnits(borrowedRaw, market.decimals),
      suppliedUsd,
      borrowedUsd,
      cashUsd: safeUnits(cashRaw, market.decimals) * priceUsd,
      borrowApy,
      supplyApy,
    };
  }), [marketResults, rateResults]);

  const contractHealthFactor = healthFactorRaw === undefined || healthFactorRaw >= maxUint256 - 1000n
    ? null
    : safeUnits(healthFactorRaw, 18);

  const summary = useMemo(
    () => buildRiskSummary(markets, contractHealthFactor),
    [markets, contractHealthFactor],
  );
  const marketsWithRisk = useMemo(
    () => markets.map((market) => {
      const liquidationPriceUsd = liquidationPriceForCollateral({
        suppliedUsd: market.suppliedUsd,
        currentPriceUsd: market.priceUsd,
        liquidationThresholdBps: market.liquidationThresholdBps,
        totalWeightedCollateralUsd: summary.weightedCollateralUsd,
        totalDebtUsd: summary.totalDebtUsd,
      });
      const distanceToLiquidationPct =
        liquidationPriceUsd == null || market.priceUsd <= 0 || liquidationPriceUsd <= 0
          ? null
          : ((market.priceUsd - liquidationPriceUsd) / market.priceUsd) * 100;

      return {
        ...market,
        collateralSharePct: summary.totalCollateralUsd > 0
          ? (market.suppliedUsd / summary.totalCollateralUsd) * 100
          : 0,
        liquidationPriceUsd,
        distanceToLiquidationPct,
      };
    }),
    [markets, summary],
  );

  return {
    loading: rateLoading || marketLoading || healthLoading,
    enabled,
    address,
    markets: marketsWithRisk,
    summary,
  };
}
