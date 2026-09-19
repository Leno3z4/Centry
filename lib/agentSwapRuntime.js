import { Contract, JsonRpcProvider, getAddress } from "ethers";
import {
  ARC_MAINNET_CHAIN_ID,
  CENT,
  USDC,
  UNITFLOW_V3_QUOTER,
  resolveSwapAsset,
  SUPPORTED_UNITFLOW_FEES,
} from "./agentExecutionCatalog";

const QUOTER_ABI = [
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)",
];

export async function getAgentSwapQuote({ rpcUrl, inputToken, outputToken, inputAmount, slippageBps = 50 }) {
  if (!rpcUrl) throw new Error("agent_rpc_not_configured");
  const input = resolveSwapAsset(inputToken);
  const output = resolveSwapAsset(outputToken);
  if (input !== CENT || output !== USDC) throw new Error("unsupported_swap_direction");

  let amount;
  try {
    amount = BigInt(String(inputAmount));
  } catch {
    throw new Error("input_amount_must_be_uint256");
  }
  if (amount <= 0n) throw new Error("input_amount_must_be_positive");

  const slippage = BigInt(Math.max(0, Math.min(5000, Math.floor(Number(slippageBps) || 50))));
  const quoter = new Contract(UNITFLOW_V3_QUOTER, QUOTER_ABI, new JsonRpcProvider(rpcUrl));

  let best = null;
  for (const fee of SUPPORTED_UNITFLOW_FEES) {
    const path = "0x" +
      getAddress(CENT).slice(2) +
      fee.toString(16).padStart(6, "0") +
      getAddress(USDC).slice(2);

    try {
      const result = await quoter.quoteExactInput.staticCall(path, amount);
      const outputAmount = BigInt(result[0]);
      if (outputAmount > 0n && (!best || outputAmount > best.outputAmount)) {
        best = { fee, outputAmount };
      }
    } catch {
      // No pool/liquidity at this fee tier.
    }
  }

  if (!best) throw new Error("no_unitflow_v3_quote_available");

  const minOut = best.outputAmount * (10_000n - slippage) / 10_000n;
  if (minOut <= 0n) throw new Error("swap_min_out_zero");

  return {
    chainId: ARC_MAINNET_CHAIN_ID,
    inputToken: getAddress(input),
    outputToken: getAddress(output),
    inputAmount: amount.toString(),
    outputAmount: best.outputAmount.toString(),
    minOut: minOut.toString(),
    fee: best.fee,
    slippageBps: Number(slippage),
    route: "CENT → native USDC",
    provider: "UnitFlow V3",
    routerVersion: "legacy-v3",
  };
}
