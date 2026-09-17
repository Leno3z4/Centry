import { Contract, JsonRpcProvider, getAddress } from "ethers";
import {
  ARC_TESTNET_CHAIN_ID,
  CENT,
  USDC,
  WUSDC,
  UNITFLOW_V25_SWAP_ROUTER,
  resolveSwapAsset,
} from "./agentExecutionCatalog";

const ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[] amounts)",
];
const WUSDC_SCALE = 10n ** 12n;

export async function getAgentSwapQuote({ rpcUrl, inputToken, outputToken, inputAmount, slippageBps = 50 }) {
  if (!rpcUrl) throw new Error("agent_rpc_not_configured");
  const input = resolveSwapAsset(inputToken);
  const output = resolveSwapAsset(outputToken);
  if (input === output) throw new Error("swap_assets_must_differ");

  let amount;
  try {
    amount = BigInt(String(inputAmount));
  } catch {
    throw new Error("input_amount_must_be_uint256");
  }
  if (amount <= 0n) throw new Error("input_amount_must_be_positive");

  let slippageNumber = Number(slippageBps);
  if (!Number.isFinite(slippageNumber)) slippageNumber = 50;
  const slippage = BigInt(Math.max(0, Math.min(5000, Math.floor(slippageNumber))));

  const router = new Contract(
    UNITFLOW_V25_SWAP_ROUTER,
    ROUTER_ABI,
    new JsonRpcProvider(rpcUrl),
  );
  const routerInput = input === USDC ? amount * WUSDC_SCALE : amount;
  const path = input === USDC ? [WUSDC, CENT] : [CENT, WUSDC];
  const amounts = await router.getAmountsOut(routerInput, path);
  if (!amounts?.length || amounts.length < 2) throw new Error("incomplete_swap_quote");

  const routerOutput = BigInt(amounts[amounts.length - 1]);
  if (routerOutput <= 0n) throw new Error("unusable_swap_quote");

  const outputAmount = input === CENT && output === USDC
    ? routerOutput / WUSDC_SCALE
    : routerOutput;
  if (outputAmount <= 0n) throw new Error("swap_quote_below_output_base_unit");

  const minOut = outputAmount * (10_000n - slippage) / 10_000n;
  if (minOut <= 0n) throw new Error("swap_min_out_zero");

  return {
    chainId: ARC_TESTNET_CHAIN_ID,
    inputToken: getAddress(input),
    outputToken: getAddress(output),
    inputAmount: amount.toString(),
    outputAmount: outputAmount.toString(),
    minOut: minOut.toString(),
    slippageBps: Number(slippage),
    route: input === USDC ? "USDC → WUSDC → CENT" : "CENT → WUSDC → USDC",
    provider: "UnitFlow v2.5",
  };
}
