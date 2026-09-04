const fs = require("fs");
const { ethers } = require("ethers");

const RPC_URL =
  process.env.ARC_RPC_URL_SECRET ||
  process.env.ARC_RPC_URL_VARIABLE;

const PRIVATE_KEY =
  process.env.CENTRY_REVENUE_REWARDS_OWNER_PRIVATE_KEY;

const REWARDS_ADDRESS =
  process.env.CENTRY_REVENUE_REWARDS ||
  "0xFE791C5141ef417100Ce56624bc975DA1fBE9815";

const MANIFEST_PATH =
  "keeper/reward-manifest.json";

const EXPECTED_CHAIN_ID = 5042002n;

function fail(message) {
  throw new Error(message);
}

async function main() {
  if (!RPC_URL) fail("Missing ARC_RPC_URL");
  if (!PRIVATE_KEY) fail("Missing CENTRY_REVENUE_REWARDS_OWNER_PRIVATE_KEY");
  if (!fs.existsSync(MANIFEST_PATH)) fail(`${MANIFEST_PATH} does not exist`);

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const epoch = BigInt(manifest.epoch);
  const manifestRoot = manifest.root;
  const rewardBudget = BigInt(manifest.rewardBudget ?? 0);

  if (epoch <= 0n) fail("Manifest epoch must be greater than zero");
  if (!ethers.isHexString(manifestRoot, 32)) fail("Manifest root must be a 32-byte hex value");
  if (rewardBudget <= 0n) fail("Manifest reward budget must be greater than zero");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    fail(`Wrong chain. Expected Arc Testnet ${EXPECTED_CHAIN_ID}, got ${network.chainId}`);
  }

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const rewards = new ethers.Contract(
    REWARDS_ADDRESS,
    [
      "function owner() view returns (address)",
      "function latestEpoch() view returns (uint256)",
      "function pendingEpochs(uint256 epoch) view returns (bytes32 root,uint256 rewardBudget,uint40 readyAt)",
      "function epochRoots(uint256 epoch) view returns (bytes32)",
      "function epochRewardBudget(uint256 epoch) view returns (uint256)",
      "function activateEpoch(uint256 epoch)"
    ],
    wallet
  );

  const owner = await rewards.owner();
  console.log(`Activation signer: ${wallet.address}`);
  console.log(`RevenueRewards owner: ${owner}`);
  if (ethers.getAddress(wallet.address) !== ethers.getAddress(owner)) {
    fail("Activation signer is not the RevenueRewards owner");
  }

  const latestEpoch = await rewards.latestEpoch();
  console.log(`Latest active epoch: ${latestEpoch.toString()}`);

  const activeRoot = await rewards.epochRoots(epoch);
  if (activeRoot !== ethers.ZeroHash) {
    if (activeRoot.toLowerCase() !== manifestRoot.toLowerCase()) {
      fail("Epoch is already active with a different Merkle root");
    }
    const activeBudget = await rewards.epochRewardBudget(epoch);
    if (activeBudget !== rewardBudget) {
      fail("Epoch is already active with a different reward budget");
    }
    console.log(`Epoch ${epoch.toString()} is already active with the expected root and budget.`);
    return;
  }

  const pending = await rewards.pendingEpochs(epoch);
  if (pending.root === ethers.ZeroHash) fail(`Epoch ${epoch.toString()} is not queued`);
  if (pending.root.toLowerCase() !== manifestRoot.toLowerCase()) fail("Pending epoch root does not match manifest root");
  if (BigInt(pending.rewardBudget) !== rewardBudget) fail("Pending epoch reward budget does not match manifest budget");

  const now = Math.floor(Date.now() / 1000);
  const readyAt = Number(pending.readyAt);

  console.log(`Manifest epoch: ${epoch.toString()}`);
  console.log(`Pending root: ${pending.root}`);
  console.log(`Pending reward budget: ${pending.rewardBudget.toString()}`);
  console.log(`Ready at: ${new Date(readyAt * 1000).toISOString()}`);

  if (now < readyAt) {
    const remaining = readyAt - now;
    console.log(`Epoch is not ready yet. Approximately ${remaining} seconds remain.`);
    return;
  }

  const tx = await rewards.activateEpoch(epoch);
  console.log(`Submitted activation transaction: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);

  const activatedLatest = await rewards.latestEpoch();
  const activatedRoot = await rewards.epochRoots(epoch);
  const activatedBudget = await rewards.epochRewardBudget(epoch);

  if (activatedLatest < epoch) fail("Activation transaction confirmed but latestEpoch did not advance");
  if (activatedRoot.toLowerCase() !== manifestRoot.toLowerCase()) fail("Activation confirmed but on-chain root does not match manifest");
  if (activatedBudget !== rewardBudget) fail("Activation confirmed but on-chain reward budget does not match manifest");

  console.log(`Epoch ${epoch.toString()} activated successfully.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
