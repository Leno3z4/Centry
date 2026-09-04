const { ethers } = require("ethers");

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
  "function epochRoots(uint256 epoch) view returns (bytes32)"
];

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

  console.log("");
  console.log(
    "=============================="
  );
  console.log(
    "CENTRY REVENUE REWARDS"
  );
  console.log(
    "=============================="
  );
  console.log("");

  console.log(
    `Contract: ${REWARDS_ADDRESS}`
  );

  console.log(
    `Reward token: ${rewardToken}`
  );

  console.log(
    `veCENT: ${veCENT}`
  );

  console.log(
    `Latest epoch: ${latestEpoch.toString()}`
  );

  if (
    latestEpoch === 0n
  ) {
    console.log("");
    console.log(
      "No reward epoch has been activated yet."
    );

    return;
  }

  const root =
    await rewards.epochRoots(
      latestEpoch
    );

  console.log(
    `Latest epoch root: ${root}`
  );

  if (
    root === ethers.ZeroHash
  ) {
    console.log("");
    console.log(
      "WARNING: latestEpoch has no active Merkle root."
    );
  }

  console.log("");
  console.log(
    "Epoch data read successfully."
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
