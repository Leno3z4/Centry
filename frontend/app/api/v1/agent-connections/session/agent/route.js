import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { authenticateAgent, jsonResponse, requireScope } from "../../../../../../lib/agentApi";

const ACCOUNT_ABI = [
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function templateId() view returns (bytes32)",
  "function configHash() view returns (bytes32)",
  "function metadataURI() view returns (string)",
  "function erc8004IdentityRegistry() view returns (address)",
  "function erc8004AgentId() view returns (uint256)",
  "function agentOperators(address) view returns (bool)",
];

export async function GET(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) return auth.error;
  if (!requireScope(auth.session, "agent-management")) return jsonResponse({ error: "scope_denied", requiredScope: "agent-management" }, 403);

  const rpcUrl = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL;
  if (!rpcUrl) return jsonResponse({ error: "agent_rpc_not_configured" }, 503);

  try {
    const contract = new Contract(auth.session.account, ACCOUNT_ABI, new JsonRpcProvider(rpcUrl));
    const [owner, pendingOwner, templateId, configHash, metadataURI, identityRegistry, agentId, operatorAuthorized] = await Promise.all([
      contract.owner(),
      contract.pendingOwner(),
      contract.templateId(),
      contract.configHash(),
      contract.metadataURI(),
      contract.erc8004IdentityRegistry(),
      contract.erc8004AgentId(),
      contract.agentOperators(auth.session.operator),
    ]);

    return jsonResponse({
      account: getAddress(auth.session.account),
      owner: getAddress(owner),
      pendingOwner: getAddress(pendingOwner),
      templateId,
      configHash,
      metadataURI,
      erc8004: {
        identityRegistry: getAddress(identityRegistry),
        agentId: BigInt(agentId).toString(),
      },
      operator: auth.session.operator,
      operatorAuthorized: Boolean(operatorAuthorized),
    });
  } catch {
    return jsonResponse({ error: "agent_account_read_failed" }, 503);
  }
}
