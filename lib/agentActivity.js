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

  const latestBlock = await provider.getBlockNumber();
  const chunkSize = 10_000;
  const collected = [];
  let toBlock = latestBlock;

  while (toBlock >= 0 && collected.length < Math.max(1, Math.min(200, limit))) {
    const fromBlock = Math.max(0, toBlock - chunkSize + 1);
    const chunk = await provider.getLogs({
      address,
      fromBlock,
      toBlock,
      topics: [topics],
    });
    collected.push(...chunk);
    if (fromBlock === 0) break;
    toBlock = fromBlock - 1;
  }

  const logs = collected;

  return logs
    .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))
    .slice(0, Math.max(1, Math.min(200, limit)))
    .map((log) => {
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
