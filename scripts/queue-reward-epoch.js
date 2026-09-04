const fs = require("fs");

const { ethers } = require("ethers");

const RPC_URL =
  process.env.ARC_RPC_URL_SECRET ||
  process.env.ARC_RPC_URL_VARIABLE ||
  process.env.ARC_RPC_URL;

const PRIVATE_KEY =
  process.env.CENTRY_REVENUE_REWARDS_OWNER_PRIVATE_KEY;

const REWARDS_ADDRESS =
  process.env.CENTRY_REVENUE_REWARDS ||
  "0x06e627ce43F2ddd37e8f196824f7049416c3025b";

const MANIFEST_PATH =
  process.env.CENTRY_REWARD_MANIFEST_PATH ||
  "keeper/reward-manifest.json";

const ALLOCATIONS_PATH =
  process.env.CENTRY_REWARD_ALLOCATIONS_PATH ||
  "keeper/reward-allocations.json";

const EXPECTED_CHAIN_ID = 5042002n;

const REWARDS_ABI = [
  "function owner() view returns (address)",
  "function rewardToken() view returns (address)",
  "function latestEpoch() view returns (uint256)",
  "function epochRoots(uint256 epoch) view returns (bytes32)",
  "function pendingEpochs(uint256 epoch) view returns (bytes32 root,uint256 rewardBudget,uint40 readyAt)",
  "function queueEpoch(uint256 epoch,bytes32 root,uint256 rewardBudget)"
];

function readJson(path) {
  if (!fs.existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }

  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function requireBytes32(value, label) {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value)
  ) {
    throw new Error(`${label} must be a 32-byte hex value`);
  }

  return value;
}

async function main() {
  if (!RPC_URL) {
    throw new Error("Missing ARC_RPC_URL");
  }

  if (!PRIVATE_KEY) {
    throw new Error(
      "Missing CENTRY_REVENUE_REWARDS_OWNER_PRIVATE_KEY"
    );
  }

  const manifest = readJson(MANIFEST_PATH);
  const allocations = readJson(ALLOCATIONS_PATH);

  if (manifest.epoch === undefined) {
    throw new Error("Manifest epoch is missing");
  }

  if (!manifest.root) {
    throw new Error("Manifest root is missing");
  }

  const epoch = BigInt(manifest.epoch);
  const rewardBudget = BigInt(allocations.rewardBudget);
  const root = requireBytes32(manifest.root, "manifest.root");

  if (epoch <= 0n) {
    throw new Error("Reward epoch must be greater than zero");
  }

  if (rewardBudget <= 0n) {
    throw new Error("Reward budget must be greater than zero");
  }

  if (BigInt(allocations.epoch) !== epoch) {
    throw new Error("Allocation epoch does not match manifest epoch");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();

  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Wrong chain. Expected Arc Testnet ${EXPECTED_CHAIN_ID}, got ${network.chainId}`
    );
  }

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const rewards = new ethers.Contract(
    REWARDS_ADDRESS,
    REWARDS_ABI,
    wallet
  );

  const owner = await rewards.owner();

  console.log(`Queue signer: ${wallet.address}`);
  console.log(`RevenueRewards owner: ${owner}`);

  if (
    ethers.getAddress(owner) !==
    ethers.getAddress(wallet.address)
  ) {
    throw new Error(
      "Queue signer is not the RevenueRewards owner"
    );
  }

  const latestEpoch = await rewards.latestEpoch();
  const activeRoot = await rewards.epochRoots(epoch);
  const pending = await rewards.pendingEpochs(epoch);

  console.log(`Manifest epoch: ${epoch.toString()}`);
  console.log(`Latest active epoch: ${latestEpoch.toString()}`);
  console.log(`Manifest root: ${root}`);
  console.log(`Reward budget: ${rewardBudget.toString()}`);

  if (activeRoot !== ethers.ZeroHash) {
    if (activeRoot.toLowerCase() === root.toLowerCase()) {
      console.log(
        `Epoch ${epoch.toString()} is already active with the expected root.`
      );
      return;
    }

    throw new Error(
      `Epoch ${epoch.toString()} is already active with a different root`
    );
  }

  if (pending.root !== ethers.ZeroHash) {
    if (
      pending.root.toLowerCase() === root.toLowerCase() &&
      BigInt(pending.rewardBudget) === rewardBudget
    ) {
      console.log(
        `Epoch ${epoch.toString()} is already queued with the expected root and budget.`
      );
      console.log(`Ready at: ${new Date(Number(pending.readyAt) * 1000).toISOString()}`);
      return;
    }

    throw new Error(
      `Epoch ${epoch.toString()} is already queued with different parameters`
    );
  }

  if (epoch <= latestEpoch) {
    throw new Error(
      `Epoch ${epoch.toString()} is not a free future epoch`
    );
  }

  const rewardToken = await rewards.rewardToken();
  const rewardTokenContract = new ethers.Contract(
    rewardToken,
    ["function balanceOf(address account) view returns (uint256)"],
    provider
  );

  const balance = await rewardTokenContract.balanceOf(REWARDS_ADDRESS);

  console.log(`Reward-token balance: ${balance.toString()}`);

  if (balance < rewardBudget) {
    throw new Error(
      `RevenueRewards balance ${balance.toString()} is below reward budget ${rewardBudget.toString()}`
    );
  }

  const tx = await rewards.queueEpoch(
    epoch,
    root,
    rewardBudget
  );

  console.log(`Submitted queue transaction: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log(`Epoch ${epoch.toString()} queued successfully.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
