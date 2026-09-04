const {
  ethers
} = require("ethers");

const RPC_URL =
  process.env.ARC_RPC_URL ||
  process.env.ARC_RPC_URL_SECRET;

const REWARDS_ADDRESS =
  "0x06e627ce43F2ddd37e8f196824f7049416c3025b";

const EXPECTED_CHAIN_ID =
  5042002n;

const REWARDS_ABI = [
  "function latestEpoch() view returns (uint256)",

  "function rewardToken() view returns (address)",

  "function veCENT() view returns (address)",

  "function epochRoots(uint256 epoch) view returns (bytes32)",

  "function epochRewardBudget(uint256 epoch) view returns (uint256)",

  "function epochClaimed(uint256 epoch) view returns (uint256)",

  "function pendingEpochs(uint256 epoch) view returns (bytes32 root,uint256 rewardBudget,uint40 readyAt)"
];

function printSeparator() {
  console.log(
    "========================================"
  );
}

async function main() {
  if (!RPC_URL) {
    throw new Error(
      "Missing ARC_RPC_URL"
    );
  }

  const provider =
    new ethers.JsonRpcProvider(
      RPC_URL
    );

  const network =
    await provider.getNetwork();

  if (
    network.chainId !==
    EXPECTED_CHAIN_ID
  ) {
    throw new Error(
      `Wrong network. Expected Arc Testnet ${EXPECTED_CHAIN_ID}, got ${network.chainId}`
    );
  }

  const rewards =
    new ethers.Contract(
      REWARDS_ADDRESS,
      REWARDS_ABI,
      provider
    );

  const latestEpoch =
    await rewards.latestEpoch();

  const rewardToken =
    await rewards.rewardToken();

  const veCENT =
    await rewards.veCENT();

  printSeparator();

  console.log(
    "CENTRY REVENUE REWARDS"
  );

  printSeparator();

  console.log(
    `Contract:      ${REWARDS_ADDRESS}`
  );

  console.log(
    `Reward token:  ${rewardToken}`
  );

  console.log(
    `veCENT:        ${veCENT}`
  );

  console.log(
    `Latest epoch:  ${latestEpoch.toString()}`
  );

  console.log("");

  if (
    latestEpoch === 0n
  ) {
    console.log(
      "No activated reward epoch exists yet."
    );

    return;
  }

  const root =
    await rewards.epochRoots(
      latestEpoch
    );

  const rewardBudget =
    await rewards.epochRewardBudget(
      latestEpoch
    );

  const amountClaimed =
    await rewards.epochClaimed(
      latestEpoch
    );

  printSeparator();

  console.log(
    `ACTIVE EPOCH ${latestEpoch.toString()}`
  );

  printSeparator();

  console.log(
    `Merkle root:   ${root}`
  );

  console.log(
    `Reward budget: ${rewardBudget.toString()}`
  );

  console.log(
    `Reward claimed:${amountClaimed.toString()}`
  );

  console.log(
    `Remaining:     ${
      rewardBudget > amountClaimed
        ? (
            rewardBudget -
            amountClaimed
          ).toString()
        : "0"
    }`
  );

  console.log("");

  if (
    root ===
    ethers.ZeroHash
  ) {
    console.log(
      "WARNING: The latest epoch has no active Merkle root."
    );

    return;
  }

  if (
    rewardBudget ===
    0n
  ) {
    console.log(
      "WARNING: The latest epoch has a zero reward budget."
    );

    return;
  }

  console.log(
    "Epoch is active and funded."
  );
}

main().catch(
  (
    error
  ) => {
    console.error(
      error
    );

    process.exit(
      1
    );
  }
);
