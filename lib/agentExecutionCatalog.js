import { Interface, getAddress, isAddress } from "ethers";

export const ARC_MAINNET_CHAIN_ID = 5042;

export const LENDING_POOL = getAddress(process.env.CENTRY_LENDING_POOL || "0x0ee649E5A95eB9127cB7146b26349a92B68c17A4");
export const ORACLE = getAddress(process.env.CENTRY_ORACLE || "0x00C6d554BD44859349c4aeEA0E8216AE94FC3f84");
export const CENT = getAddress(process.env.CENTRY_TOKEN || "0x75E1C49f3fAebEc149c4c997f209A8e639c2253F");
export const USDC = getAddress(process.env.CENTRY_USDC || "0x3600000000000000000000000000000000000000");
export const EURC = getAddress(process.env.CENTRY_EURC || "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1");
export const CIRBTC = getAddress(process.env.CENTRY_CIRBTC || "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0");
export const UNITFLOW_V3_ROUTER = getAddress(process.env.CENTRY_UNITFLOW_V3_ROUTER || "0x6fD8351b9596C1F0b2f2479BfA6A171cb3d0f410");
export const UNITFLOW_V3_QUOTER = getAddress(process.env.CENTRY_UNITFLOW_V3_QUOTER || "0x5AF6E89F0960Ff375AF84d9911D8153ef6240E34");
export const GOVERNOR = process.env.CENTRY_GOVERNOR && isAddress(process.env.CENTRY_GOVERNOR) ? getAddress(process.env.CENTRY_GOVERNOR) : "";

export const SUPPORTED_ASSETS = Object.freeze({
  USDC,
  EURC,
  CIRBTC,
});

export const SUPPORTED_UNITFLOW_FEES = Object.freeze([500, 3000, 10000]);

const POOL_INTERFACE = new Interface([
  "function supply(address asset,uint256 amount)",
  "function withdraw(address asset,uint256 amount)",
  "function borrow(address asset,uint256 amount)",
  "function repay(address asset,uint256 amount)",
]);
const ERC20_INTERFACE = new Interface([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function transfer(address to,uint256 amount) returns (bool)",
]);
const UNITFLOW_ROUTER_INTERFACE = new Interface([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut)",
]);
const GOVERNOR_INTERFACE = new Interface([
  "function castVote(uint256 proposalId,uint8 support) returns (uint256)",
]);
const AGENT_INTERFACE = new Interface([
  "function transferToAgent(address token,address recipient,uint256 amount)",
]);

export const ACTIONS = Object.freeze({
  approve: { scope: "lend", description: "Approve the Centry lending pool to spend a supported lending asset held by the Centry agent account.", required: ["asset", "amount"] },
  supply: { scope: "lend", description: "Supply a supported asset from the Centry agent account into the lending pool.", required: ["asset", "amount"] },
  withdraw: { scope: "lend", description: "Withdraw a supported supplied asset from the Centry agent account.", required: ["asset", "amount"] },
  borrow: { scope: "borrow", description: "Borrow a supported asset against the Centry agent account's collateral.", required: ["asset", "amount"] },
  repay: { scope: "repay", description: "Approve and repay debt for the connected Centry agent account using the requested supported asset.", required: ["asset", "amount"] },
  swap: { scope: "swap", description: "Swap CENT to Arc native USDC through the validated UnitFlow V3 route.", required: ["asset", "toAsset", "amount", "minOut", "fee"] },
  castVote: { scope: "governance", description: "Cast a governance vote on an existing Centry Governor proposal.", required: ["proposalId", "support"] },
  transfer: { scope: "agent-to-agent", description: "Transfer a supported token to another Centry agent owned by the same user.", required: ["toAgentId", "asset", "amount"] },
});

export function parseUint(value, field) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") throw new Error(`${field}_must_be_uint256`);
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
    if (Object.values(SUPPORTED_ASSETS).includes(normalized)) return normalized;
  }
  throw new Error("unsupported_asset");
}

export function resolveSwapAsset(value) {
  if (typeof value !== "string") throw new Error("invalid_swap_asset");
  if (value.toUpperCase() === "CENT") return CENT;
  if (value.toUpperCase() === "USDC") return USDC;
  if (isAddress(value)) {
    const normalized = getAddress(value);
    if (normalized === CENT || normalized === USDC) return normalized;
  }
  throw new Error("unsupported_swap_asset");
}

function call(target, data, value = 0n) {
  return { target, value, selector: data.slice(0, 10), data };
}

function buildSwap({ account, asset, toAsset, amount, minOut, fee = 3000 }) {
  if (!isAddress(account)) throw new Error("invalid_swap_account");
  const inputToken = resolveSwapAsset(asset);
  const outputToken = resolveSwapAsset(toAsset);
  if (inputToken !== CENT || outputToken !== USDC) throw new Error("unsupported_swap_direction");

  const amountIn = parseUint(amount, "amount");
  const minOutput = parseUint(minOut, "minOut");
  const parsedFee = Number(fee);
  if (!SUPPORTED_UNITFLOW_FEES.includes(parsedFee)) throw new Error("unsupported_unitflow_fee");
  if (amountIn <= 0n || minOutput <= 0n) throw new Error("swap_amounts_must_be_positive");

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const params = {
    tokenIn: CENT,
    tokenOut: USDC,
    fee: parsedFee,
    recipient: getAddress(account),
    deadline,
    amountIn,
    amountOutMinimum: minOutput,
    sqrtPriceLimitX96: 0,
  };

  const swapData = UNITFLOW_ROUTER_INTERFACE.encodeFunctionData("exactInputSingle", [params]);

  return {
    calls: [
      call(CENT, ERC20_INTERFACE.encodeFunctionData("approve", [UNITFLOW_V3_ROUTER, amountIn])),
      call(UNITFLOW_V3_ROUTER, swapData),
    ],
    description: ACTIONS.swap.description,
  };
}

export function buildAction({ account, action, asset, amount, toAsset, minOut, fee, proposalId, support, recipient }) {
  if (!ACTIONS[action]) throw new Error("unsupported_action");
  switch (action) {
    case "approve": {
      const resolvedAsset = resolveAsset(asset);
      const parsedAmount = parseUint(amount, "amount");
      return { scope: ACTIONS.approve.scope, calls: [call(resolvedAsset, ERC20_INTERFACE.encodeFunctionData("approve", [LENDING_POOL, parsedAmount]))], description: ACTIONS.approve.description };
    }
    case "supply":
    case "withdraw":
    case "borrow": {
      const resolvedAsset = resolveAsset(asset);
      const parsedAmount = parseUint(amount, "amount");
      return { scope: ACTIONS[action].scope, calls: [call(LENDING_POOL, POOL_INTERFACE.encodeFunctionData(action, [resolvedAsset, parsedAmount]))], description: ACTIONS[action].description };
    }
    case "repay": {
      const resolvedAsset = resolveAsset(asset);
      const parsedAmount = parseUint(amount, "amount");
      return {
        scope: ACTIONS.repay.scope,
        calls: [
          call(resolvedAsset, ERC20_INTERFACE.encodeFunctionData("approve", [LENDING_POOL, parsedAmount])),
          call(LENDING_POOL, POOL_INTERFACE.encodeFunctionData("repay", [resolvedAsset, parsedAmount])),
        ],
        description: ACTIONS.repay.description,
      };
    }
    case "swap":
      return { scope: ACTIONS.swap.scope, ...buildSwap({ account, asset, toAsset, amount, minOut, fee }) };
    case "transfer": {
      const resolvedAsset = resolveAsset(asset);
      const parsedAmount = parseUint(amount, "amount");
      if (!isAddress(recipient)) throw new Error("invalid_transfer_recipient");
      return { scope: ACTIONS.transfer.scope, calls: [call(getAddress(account), AGENT_INTERFACE.encodeFunctionData("transferToAgent", [resolvedAsset, getAddress(recipient), parsedAmount]))], description: ACTIONS.transfer.description };
    }
    case "castVote": {
      if (!GOVERNOR) throw new Error("governor_not_configured");
      const parsedProposalId = parseUint(proposalId, "proposalId");
      const parsedSupport = parseUint(support, "support");
      if (parsedSupport > 2n) throw new Error("support_must_be_0_1_or_2");
      return { scope: ACTIONS.castVote.scope, calls: [call(GOVERNOR, GOVERNOR_INTERFACE.encodeFunctionData("castVote", [parsedProposalId, parsedSupport]))], description: ACTIONS.castVote.description };
    }
    default:
      throw new Error("unsupported_action");
  }
}

export function actionCatalog() {
  return Object.entries(ACTIONS)
    .filter(([name]) => name !== "castVote" || Boolean(GOVERNOR))
    .map(([name, definition]) => ({ name, scope: definition.scope, description: definition.description, required: definition.required }));
}
