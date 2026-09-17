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
  if (input !== CENT || output !== USDC) throw new Error("unsupported_swap_direction");

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
  const amounts = await router.getAmountsOut(amount, [CENT, WUSDC]);
  if (!amounts?.length || amounts.length < 2) throw new Error("incomplete_swap_quote");

  const routerOutput = BigInt(amounts[amounts.length - 1]);
  if (routerOutput <= 0n) throw new Error("unusable_swap_quote");

  const outputAmount = routerOutput / WUSDC_SCALE;
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
    route: "CENT → WUSDC → native USDC",
    provider: "UnitFlow v2.5",
  };
}
