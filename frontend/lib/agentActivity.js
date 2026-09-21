import { Interface, JsonRpcProvider, getAddress } from "ethers";

const EVENT_INTERFACE = new Interface([
  "event AgentExecuted(address indexed operator,address indexed target,uint256 value,bytes4 indexed selector,bytes32 dataHash)",
  "event AgentBatchExecuted(address indexed operator,uint256 callCount)",
  "event AgentOperatorSet(address indexed operator,bool active)",
  "event PermissionSet(address indexed operator,address indexed target,bytes4 indexed selector,bool allowed,uint64 expiresAt,uint128 maxNativeValue)",
  "event AgentActivationSet(bool active)",
]);

export async function getAgentActivity(account, rpcUrl, limit = 100) {
  if (!rpcUrl) throw new Error("agent_rpc_not_configured");
  const provider = new JsonRpcProvider(rpcUrl);
  const address = getAddress(account);
  const topics = [
    EVENT_INTERFACE.getEvent("AgentExecuted").topicHash,
    EVENT_INTERFACE.getEvent("AgentBatchExecuted").topicHash,
    EVENT_INTERFACE.getEvent("AgentOperatorSet").topicHash,
    EVENT_INTERFACE.getEvent("PermissionSet").topicHash,
    EVENT_INTERFACE.getEvent("AgentActivationSet").topicHash,
  ];

  const logs = await provider.getLogs({
    address,
    fromBlock: 0,
    toBlock: "latest",
    topics: [topics],
  });

  return logs.slice(Math.max(0, logs.length - Math.max(1, Math.min(200, limit)))).reverse().map((log) => {
    let parsed;
    try { parsed = EVENT_INTERFACE.parseLog(log); } catch {}
    return {
      type: parsed?.name || "Unknown",
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      args: parsed ? Object.fromEntries(Object.entries(parsed.args).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value])) : {},
    };
  });
}
