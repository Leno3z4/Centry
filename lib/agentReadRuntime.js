import { Contract, JsonRpcProvider, getAddress } from "ethers";
import {
  LENDING_POOL,
  ORACLE,
  SUPPORTED_ASSETS,
} from "./agentExecutionRuntime";
import { ARC_MAINNET_CHAIN_ID } from "./agentExecutionCatalog";

const RESERVE_LIMIT = 16;

const POOL_READ_ABI = [
  "function reserveList(uint256) view returns (address)",
  "function getReserveConfig(address) view returns (bool active,uint8 decimals,uint16 ltvBps,uint16 liquidationThresholdBps,uint16 liquidationBonusBps,uint16 reserveFactorBps,uint128 supplyCap,uint128 borrowCap)",
  "function supplyBalance(address user,address asset) view returns (uint256)",
  "function borrowBalance(address user,address asset) view returns (uint256)",
  "function currentSupply(address asset) view returns (uint256)",
  "function currentBorrow(address asset) view returns (uint256)",
  "function utilization(address asset) view returns (uint256)",
  "function healthFactor(address user) view returns (uint256)",
  "function borrowPower(address user) view returns (uint256)",
];

const ORACLE_ABI = [
  "function getPrice(address asset) view returns (uint256 priceE18,uint256 updatedAt)",
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

function providerFor(rpcUrl) {
  if (!rpcUrl) throw new Error("agent_rpc_not_configured");
  return new JsonRpcProvider(rpcUrl);
}

function safeString(value) {
  return value?.toString?.() ?? String(value ?? "0");
}

async function readToken(provider, account, asset) {
  const token = new Contract(asset, ERC20_ABI, provider);
  const [balance, decimals, symbol] = await Promise.all([
    token.balanceOf(account),
    token.decimals().catch(() => 18),
    token.symbol().catch(() => "TOKEN"),
  ]);
  return {
    asset: getAddress(asset),
    symbol,
    decimals: Number(decimals),
    balance: safeString(balance),
  };
}

async function readPosition(provider, pool, oracle, account, asset, config) {
  const [supply, borrow, price] = await Promise.all([
    pool.supplyBalance(account, asset),
    pool.borrowBalance(account, asset),
    oracle.getPrice(asset).catch(() => [0n, 0n]),
  ]);

  return {
    asset: getAddress(asset),
    decimals: Number(config.decimals),
    supply: safeString(supply),
    borrow: safeString(borrow),
    priceE18: safeString(price[0]),
    priceUpdatedAt: safeString(price[1]),
    ltvBps: Number(config.ltvBps),
    liquidationThresholdBps: Number(config.liquidationThresholdBps),
    liquidationBonusBps: Number(config.liquidationBonusBps),
  };
}

async function readReserves(pool) {
  const reserves = [];
  for (let index = 0; index < RESERVE_LIMIT; index += 1) {
    const asset = await pool.reserveList(index).catch(() => "0x0000000000000000000000000000000000000000");
    if (!asset || asset === "0x0000000000000000000000000000000000000000") break;
    reserves.push(getAddress(asset));
  }
  return reserves;
}

export async function getAgentPortfolio({ rpcUrl, account }) {
  const provider = providerFor(rpcUrl);
  const pool = new Contract(LENDING_POOL, POOL_READ_ABI, provider);
  const oracle = new Contract(ORACLE, ORACLE_ABI, provider);

  const tokenEntries = await Promise.all(
    Object.values(SUPPORTED_ASSETS).map((asset) => readToken(provider, account, asset).catch(() => ({ asset: getAddress(asset), symbol: "TOKEN", decimals: null, balance: "0" }))),
  );

  const positions = await getAgentPositions({ rpcUrl, account, provider, pool, oracle });
  let healthFactor = "0";
  let borrowPower = "0";
  try {
    [healthFactor, borrowPower] = await Promise.all([
      pool.healthFactor(account).then(safeString),
      pool.borrowPower(account).then(safeString),
    ]);
  } catch {
    // Risk data can be unavailable for accounts with no reserves/positions.
  }

  return {
    chainId: ARC_MAINNET_CHAIN_ID,
    account: getAddress(account),
    balances: tokenEntries,
    positions,
    healthFactor,
    borrowPower,
  };
}

export async function getAgentPositions({ rpcUrl, account, provider, pool, oracle }) {
  const activeProvider = provider || providerFor(rpcUrl);
  const activePool = pool || new Contract(LENDING_POOL, POOL_READ_ABI, activeProvider);
  const activeOracle = oracle || new Contract(ORACLE, ORACLE_ABI, activeProvider);
  const reserves = await readReserves(activePool);

  return Promise.all(
    reserves.map(async (asset) => {
      const config = await activePool.getReserveConfig(asset);
      if (!config.active) return null;
      return readPosition(activeProvider, activePool, activeOracle, account, asset, {
        decimals: config.decimals,
        ltvBps: config.ltvBps,
        liquidationThresholdBps: config.liquidationThresholdBps,
        liquidationBonusBps: config.liquidationBonusBps,
      });
    }),
  ).then((items) => items.filter(Boolean));
}

export async function getAgentMarkets({ rpcUrl }) {
  const provider = providerFor(rpcUrl);
  const pool = new Contract(LENDING_POOL, POOL_READ_ABI, provider);
  const oracle = new Contract(ORACLE, ORACLE_ABI, provider);
  const reserves = await readReserves(pool);

  return Promise.all(
    reserves.map(async (asset) => {
      const [config, supply, borrow, utilization, price] = await Promise.all([
        pool.getReserveConfig(asset),
        pool.currentSupply(asset),
        pool.currentBorrow(asset),
        pool.utilization(asset),
        oracle.getPrice(asset).catch(() => [0n, 0n]),
      ]);
      const token = new Contract(asset, ERC20_ABI, provider);
      const [symbol, decimals] = await Promise.all([
        token.symbol().catch(() => "TOKEN"),
        token.decimals().catch(() => config.decimals),
      ]);

      return {
        asset: getAddress(asset),
        symbol,
        decimals: Number(decimals),
        active: Boolean(config.active),
        ltvBps: Number(config.ltvBps),
        liquidationThresholdBps: Number(config.liquidationThresholdBps),
        liquidationBonusBps: Number(config.liquidationBonusBps),
        reserveFactorBps: Number(config.reserveFactorBps),
        supplyCap: safeString(config.supplyCap),
        borrowCap: safeString(config.borrowCap),
        currentSupply: safeString(supply),
        currentBorrow: safeString(borrow),
        utilization: safeString(utilization),
        priceE18: safeString(price[0]),
        priceUpdatedAt: safeString(price[1]),
      };
    }),
  );
}
