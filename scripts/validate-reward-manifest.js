const fs = require("fs");

const { ethers } = require("ethers");

const MANIFEST_PATH =
  "keeper/reward-manifest.json";

const REWARDS =
  process.env.CENTRY_REVENUE_REWARDS ||
  "0xFE791C5141ef417100Ce56624bc975DA1fBE9815";

const RPC_URL =
  process.env.ARC_RPC_URL_SECRET ||
  process.env.ARC_RPC_URL_VARIABLE;

function assertBytes32(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte hex value`);
  }
}

function leafHash(tokenId, amount) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256"],
    [BigInt(tokenId), BigInt(amount)]
  );
  const innerHash = ethers.keccak256(encoded);
  return ethers.keccak256(ethers.concat([innerHash]));
}

function pairHash(left, right) {
  let first = left;
  let second = right;
  if (first.toLowerCase() > second.toLowerCase()) {
    [first, second] = [second, first];
  }
  return ethers.keccak256(ethers.concat([first, second]));
}

function verifyProof(proof, root, leaf) {
  let computed = leaf;
  for (const sibling of proof) {
    computed = pairHash(computed, sibling);
  }
  return computed.toLowerCase() === root.toLowerCase();
}

if (!fs.existsSync(MANIFEST_PATH)) {
  throw new Error(`${MANIFEST_PATH} does not exist`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

if (!manifest || manifest.epoch === undefined) {
  throw new Error("Manifest epoch is missing");
}

if (!Array.isArray(manifest.positions)) {
  throw new Error("Manifest positions array is missing");
}

const epoch = BigInt(manifest.epoch);
if (epoch <= 0n) throw new Error("Manifest epoch must be greater than zero");
if (!manifest.root) throw new Error("Manifest root is missing");
assertBytes32(manifest.root, "manifest.root");

const seen = new Set();

for (const position of manifest.positions) {
  if (position.tokenId === undefined) throw new Error("Position tokenId is missing");
  if (position.amount === undefined) throw new Error(`tokenId ${position.tokenId}: amount is missing`);
  if (!Array.isArray(position.proof)) throw new Error(`tokenId ${position.tokenId}: proof is missing`);
  if (!Array.isArray(position.instructions)) throw new Error(`tokenId ${position.tokenId}: instructions are missing`);

  const tokenId = BigInt(position.tokenId).toString();
  if (seen.has(tokenId)) throw new Error(`Duplicate tokenId ${tokenId}`);
  seen.add(tokenId);

  const amount = BigInt(position.amount);
  if (amount <= 0n) throw new Error(`tokenId ${tokenId}: reward amount must be positive`);

  for (const proofItem of position.proof) {
    assertBytes32(proofItem, `tokenId ${tokenId} proof`);
  }

  const leaf = leafHash(tokenId, amount);
  if (!verifyProof(position.proof, manifest.root, leaf)) {
    throw new Error(`tokenId ${tokenId}: Merkle proof does not match manifest root`);
  }

  let totalInput = 0n;
  for (const instruction of position.instructions) {
    if (!ethers.isAddress(instruction.debtAsset)) {
      throw new Error(`tokenId ${tokenId}: invalid debtAsset`);
    }

    const rewardAmountIn = BigInt(instruction.rewardAmountIn);
    const minDebtAssetOut = BigInt(instruction.minDebtAssetOut);

    if (rewardAmountIn <= 0n) throw new Error(`tokenId ${tokenId}: rewardAmountIn must be positive`);
    if (minDebtAssetOut <= 0n) throw new Error(`tokenId ${tokenId}: minDebtAssetOut must be positive`);
    if (typeof instruction.swapData !== "string") throw new Error(`tokenId ${tokenId}: swapData is invalid`);
    if (!instruction.swapData.startsWith("0x")) throw new Error(`tokenId ${tokenId}: swapData must be hex`);
    if (instruction.swapData.length % 2 !== 0) throw new Error(`tokenId ${tokenId}: swapData has invalid byte length`);

    totalInput += rewardAmountIn;
  }

  if (totalInput > amount) {
    throw new Error(`tokenId ${tokenId}: swap instructions exceed reward allocation`);
  }
}

async function main() {
  if (!RPC_URL) {
    console.log("Structural manifest validation passed.");
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const rewards = new ethers.Contract(
    REWARDS,
    [
      "function latestEpoch() view returns (uint256)",
      "function epochRoots(uint256 epoch) view returns (bytes32)"
    ],
    provider
  );

  const latestEpoch = await rewards.latestEpoch();
  if (epoch > latestEpoch) throw new Error(`Manifest epoch ${epoch} is not active`);

  const onChainRoot = await rewards.epochRoots(epoch);
  if (onChainRoot === ethers.ZeroHash) throw new Error(`No active root for epoch ${epoch}`);
  if (onChainRoot.toLowerCase() !== manifest.root.toLowerCase()) {
    throw new Error("Manifest root does not match RevenueRewards");
  }

  console.log(`Manifest validated successfully for active epoch ${epoch}`);
  console.log(`Root: ${onChainRoot}`);
  console.log(`Positions: ${manifest.positions.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
