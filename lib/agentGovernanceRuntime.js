import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { ARC_MAINNET_CHAIN_ID, GOVERNOR } from "./agentExecutionCatalog";

const GOVERNOR_ABI = [
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalSnapshot(uint256 proposalId) view returns (uint256)",
  "function proposalDeadline(uint256 proposalId) view returns (uint256)",
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes,uint256 forVotes,uint256 abstainVotes)",
  "function quorum(uint256 timepoint) view returns (uint256)",
  "function getVotes(address account,uint256 timepoint) view returns (uint256)",
];

const STATE_NAMES = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"];

export async function getGovernanceProposal({ rpcUrl, account, proposalId }) {
  if (!GOVERNOR) throw new Error("governor_not_configured");
  const id = BigInt(String(proposalId));
  if (id < 0n) throw new Error("proposal_id_must_be_uint256");

  const governor = new Contract(GOVERNOR, GOVERNOR_ABI, new JsonRpcProvider(rpcUrl));
  const [state, snapshot, deadline, votes] = await Promise.all([
    governor.state(id),
    governor.proposalSnapshot(id),
    governor.proposalDeadline(id),
    governor.proposalVotes(id),
  ]);

  const snapshotValue = BigInt(snapshot);
  const [quorum, votingPower] = await Promise.all([
    governor.quorum(snapshotValue),
    governor.getVotes(getAddress(account), snapshotValue),
  ]);

  const stateValue = Number(state);
  return {
    chainId: ARC_MAINNET_CHAIN_ID,
    governor: getAddress(GOVERNOR),
    proposalId: id.toString(),
    state: stateValue,
    stateName: STATE_NAMES[stateValue] || "Unknown",
    snapshot: snapshotValue.toString(),
    deadline: BigInt(deadline).toString(),
    quorum: BigInt(quorum).toString(),
    votingPower: BigInt(votingPower).toString(),
    votes: {
      against: BigInt(votes[0]).toString(),
      for: BigInt(votes[1]).toString(),
      abstain: BigInt(votes[2]).toString(),
    },
  };
}
