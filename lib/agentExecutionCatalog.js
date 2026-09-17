import { Interface, encodeAbiParameters, getAddress, isAddress } from "ethers";

export const ARC_TESTNET_CHAIN_ID = 5042002;

export const LENDING_POOL = getAddress(
  process.env.CENTRY_LENDING_POOL || "0x90C935687D91b3352b2C55cd79389C92950D94BD"
);

export const ORACLE = getAddress(
  process.env.CENTRY_ORACLE || "0xC82424D224dbfBF9D41a9cBe5cA2AdF762572fC6"
);

export const CENT = getAddress(
  process.env.CENTRY_TOKEN || "0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3"
);

export const USDC = getAddress(
  process.env.CENTRY_USDC || "0x3600000000000000000000000000000000000000"
);

export const WUSDC = getAddress(
  process.env.CENTRY_WUSDC || "0x911b4000D3422F482F4062a913885f7b035382Df"
);

export const UNITFLOW_UNIVERSAL_ROUTER = getAddress(
  process.env.CENTRY_UNITFLOW_UNIVERSAL_ROUTER || "0xEaF3195bE51861632cd32850973C9515DA48e76F"
);

export const GOVERNOR = process.env.CENTRY_GOVERNOR && isAddress(process.env.CENTRY_GOVERNOR)
  ? getAddress(process.env.CENTRY_GOVERNOR)
  : "";

export const SUPPORTED_ASSETS = Object.freeze({
  USDC,
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

const SWAP_ROUTER_INTERFACE = new Interface([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline)",
]);

const GOVERNOR_INTERFACE = new Interface([
  "function castVote(uint256 proposalId,uint8 support) returns (uint256)",
]);

const SWAP_WUSDC_SCALE = 10n ** 12n;
const ACTIONS = Object.freeze({
  approve: {
    scope: "lend",
    description: "Approve the Centry lending pool to spend a supported lending asset held by the Centry agent account.",
    required: ["asset", "amount"],
  },
  supply: {
    scope: "lend",
    description: "Supply a supported asset from the Centry agent account into the lending pool.",
    required: ["asset", "amount"],
  },
  withdraw: {
    scope: "lend",
    description: "Withdraw a supported supplied asset from the lending pool to the Centry agent account.",
    required: ["asset", "amount"],
  },
  borrow: {
    scope: "borrow",
    description: "Borrow a supported asset against the Centry agent account's collateral.",
    required: ["asset", "amount"],
  },
  repay: {
    scope: "repay",
    description: "Repay debt for the Centry agent account using an asset it holds.",
    required: ["asset", "amount"],
  },
  swap: {
    scope: "swap",
    description: "Swap CENT and native Arc USDC through Centry's configured UnitFlow Universal Router path.",
    required: ["asset", "toAsset", "amount", "minOut"],
  },
  castVote: {
    scope: "governance",
    description: "Cast a governance vote on an existing Centry Governor proposal.",
    required: ["proposalId", "support"],
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

function resolveSwapAsset(value) {
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
  return {
    target,
    value,
    selector: data.slice(0, 10),
    data,
  };
}

function buildSwap({ asset, toAsset, amount, minOut }) {
  const inputToken = resolveSwapAsset(asset);
  const outputToken = resolveSwapAsset(toAsset);
  if (inputToken === outputToken) throw new Error("swap_assets_must_differ");

  const amountIn = parseUint(amount, "amount");
  const minOutput = parseUint(minOut, "minOut");
  if (amountIn <= 0n || minOutput <= 0n) throw new Error("swap_amounts_must_be_positive");

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  if (inputToken === CENT && outputToken === USDC) {
    const nativeMinOut = minOutput;
    const routerMinOut = nativeMinOut * SWAP_WUSDC_SCALE;
    const path = [CENT, WUSDC];
    const commands = "0x080c";
    const inputs = [
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address[]" }, { type: "bool" }],
        [UNITFLOW_UNIVERSAL_ROUTER, amountIn, routerMinOut, path, true],
      ),
      encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [UNITFLOW_UNIVERSAL_ROUTER, nativeMinOut]),
    ];
    const approval = call(
      CENT,
      ERC20_INTERFACE.encodeFunctionData("approve", [UNITFLOW_UNIVERSAL_ROUTER, amountIn]),
    );
    const swap = call(
      UNITFLOW_UNIVERSAL_ROUTER,
      SWAP_ROUTER_INTERFACE.encodeFunctionData("execute", [commands, inputs, deadline]),
    );
    return {
      calls: [approval, swap],
      description: ACTIONS.swap.description,
    };
  }

  const nativeAmount = amountIn * SWAP_WUSDC_SCALE;
  const path = [WUSDC, CENT];
  const commands = "0x0b08";
  const inputs = [
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [UNITFLOW_UNIVERSAL_ROUTER, nativeAmount]),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address[]" }, { type: "bool" }],
      [UNITFLOW_UNIVERSAL_ROUTER, nativeAmount, minOutput, path, false],
    ),
  ];
  const swap = call(
    UNITFLOW_UNIVERSAL_ROUTER,
    SWAP_ROUTER_INTERFACE.encodeFunctionData("execute", [commands, inputs, deadline]),
    nativeAmount,
  );
  return {
    calls: [swap],
    description: ACTIONS.swap.description,
  };
}

export function buildAction({ action, asset, amount, toAsset, minOut, proposalId, support }) {
  if (!ACTIONS[action]) throw new Error("unsupported_action");

  switch (action) {
    case "approve": {
      const resolvedAsset = resolveAsset(asset);
      const parsedAmount = parseUint(amount, "amount");
      const data = ERC20_INTERFACE.encodeFunctionData("approve", [LENDING_POOL, parsedAmount]);
      return { scope: ACTIONS.approve.scope, calls: [call(resolvedAsset, data)], description: ACTIONS.approve.description };
    }
    case "supply":
    case "withdraw":
    case "borrow":
    case "repay": {
      const resolvedAsset = resolveAsset(asset);
      const parsedAmount = parseUint(amount, "amount");
      const data = POOL_INTERFACE.encodeFunctionData(action, [resolvedAsset, parsedAmount]);
      return { scope: ACTIONS[action].scope, calls: [call(LENDING_POOL, data)], description: ACTIONS[action].description };
    }
    case "swap": {
      const result = buildSwap({ asset, toAsset, amount, minOut });
      return { scope: ACTIONS.swap.scope, ...result };
    }
    case "castVote": {
      if (!GOVERNOR) throw new Error("governor_not_configured");
      const parsedProposalId = parseUint(proposalId, "proposalId");
      const parsedSupport = parseUint(support, "support");
      if (parsedSupport > 2n) throw new Error("support_must_be_0_1_or_2");
      const data = GOVERNOR_INTERFACE.encodeFunctionData("castVote", [parsedProposalId, parsedSupport]);
      return {
        scope: ACTIONS.castVote.scope,
        calls: [call(GOVERNOR, data)],
        description: ACTIONS.castVote.description,
      };
    }
    default:
      throw new Error("unsupported_action");
  }
}

export function actionCatalog() {
  return Object.entries(ACTIONS).map(([name, definition]) => ({
    name,
    scope: definition.scope,
    description: definition.description,
    required: definition.required,
  }));
}
