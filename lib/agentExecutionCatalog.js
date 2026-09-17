import { Interface, getAddress, isAddress } from "ethers";

export const ARC_TESTNET_CHAIN_ID = 5042002;

export const LENDING_POOL = getAddress(
  process.env.CENTRY_LENDING_POOL || "0x90C935687D91b3352b2C55cd79389C92950D94BD"
);

export const SUPPORTED_ASSETS = Object.freeze({
  USDC: getAddress(process.env.CENTRY_USDC || "0x3600000000000000000000000000000000000000"),
  EURC: getAddress(process.env.CENTRY_EURC || "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"),
  CIRBTC: getAddress(process.env.CENTRY_CIRBTC || "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF"),
});

const POOL_INTERFACE = new Interface([
  "function supply(address asset,uint256 amount)",
  "function withdraw(address asset,uint256 amount)",
  "function borrow(address asset,uint256 amount)",
  "function repay(address asset,uint256 amount)",
]);

const ERC20_INTERFACE = new Interface([
  "function approve(address spender,uint256 amount) returns (bool)",
]);

export const ACTIONS = Object.freeze({
  approve: {
    scope: "lend",
    description: "Approve the Centry lending pool to spend an asset held by the Centry agent account.",
  },
  supply: {
    scope: "lend",
    description: "Supply a supported asset from the Centry agent account into the lending pool.",
  },
  withdraw: {
    scope: "lend",
    description: "Withdraw a supported supplied asset from the lending pool to the Centry agent account.",
  },
  borrow: {
    scope: "borrow",
    description: "Borrow a supported asset against the Centry agent account's collateral.",
  },
  repay: {
    scope: "repay",
    description: "Repay debt for the Centry agent account using an asset it holds.",
  },
});

export function parseUint(value, field) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new Error(`${field}_must_be_uint256`);
  }
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error("negative");
    return parsed;
  } catch {
    throw new Error(`${field}_must_be_uint256`);
  }
}

export function resolveAsset(value) {
  if (typeof value !== "string") throw new Error("invalid_asset");
  const key = value.toUpperCase();
  if (SUPPORTED_ASSETS[key]) return SUPPORTED_ASSETS[key];
  if (isAddress(value)) {
    const normalized = getAddress(value);
    const allowed = Object.values(SUPPORTED_ASSETS).some((asset) => asset === normalized);
    if (allowed) return normalized;
  }
  throw new Error("unsupported_asset");
}

export function buildAction({ action, asset, amount }) {
  if (!ACTIONS[action]) throw new Error("unsupported_action");
  const resolvedAsset = resolveAsset(asset);
  const parsedAmount = parseUint(amount, "amount");

  switch (action) {
    case "approve":
      return {
        scope: "lend",
        target: resolvedAsset,
        value: 0n,
        selector: ERC20_INTERFACE.getFunction("approve").selector,
        data: ERC20_INTERFACE.encodeFunctionData("approve", [LENDING_POOL, parsedAmount]),
        description: ACTIONS.approve.description,
      };
    case "supply":
      return {
        scope: "lend",
        target: LENDING_POOL,
        value: 0n,
        selector: POOL_INTERFACE.getFunction("supply").selector,
        data: POOL_INTERFACE.encodeFunctionData("supply", [resolvedAsset, parsedAmount]),
        description: ACTIONS.supply.description,
      };
    case "withdraw":
      return {
        scope: "lend",
        target: LENDING_POOL,
        value: 0n,
        selector: POOL_INTERFACE.getFunction("withdraw").selector,
        data: POOL_INTERFACE.encodeFunctionData("withdraw", [resolvedAsset, parsedAmount]),
        description: ACTIONS.withdraw.description,
      };
    case "borrow":
      return {
        scope: "borrow",
        target: LENDING_POOL,
        value: 0n,
        selector: POOL_INTERFACE.getFunction("borrow").selector,
        data: POOL_INTERFACE.encodeFunctionData("borrow", [resolvedAsset, parsedAmount]),
        description: ACTIONS.borrow.description,
      };
    case "repay":
      return {
        scope: "repay",
        target: LENDING_POOL,
        value: 0n,
        selector: POOL_INTERFACE.getFunction("repay").selector,
        data: POOL_INTERFACE.encodeFunctionData("repay", [resolvedAsset, parsedAmount]),
        description: ACTIONS.repay.description,
      };
    default:
      throw new Error("unsupported_action");
  }
}

export function actionCatalog() {
  return Object.entries(ACTIONS).map(([name, definition]) => ({
    name,
    scope: definition.scope,
    description: definition.description,
    required: name === "approve" ? ["asset", "amount"] : ["asset", "amount"],
  }));
}
