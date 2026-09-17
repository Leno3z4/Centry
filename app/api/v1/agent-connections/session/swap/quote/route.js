import { authenticateAgent, jsonResponse, requireScope } from "../../../../../../../lib/agentApi";
import { getAgentSwapQuote } from "../../../../../../../lib/agentSwapRuntime";

export async function POST(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  if (!requireScope(auth.session, "swap")) return jsonResponse({ error: "scope_denied", requiredScope: "swap" }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const { inputToken, outputToken, inputAmount, slippageBps = 50 } = body || {};
  if (!inputToken || !outputToken || inputAmount === undefined) {
    return jsonResponse({ error: "missing_input_token_output_token_or_amount" }, 400);
  }

  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
  try {
    return jsonResponse(await getAgentSwapQuote({ rpcUrl, inputToken, outputToken, inputAmount, slippageBps }));
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "swap_quote_failed" }, 400);
  }
}
