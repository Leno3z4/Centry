const fs = require("fs");
const { ethers } = require("ethers");

const RPC_URL =
  process.env.ARC_RPC_URL_SECRET ||
  process.env.ARC_RPC_URL_VARIABLE ||
  process.env.ARC_RPC_URL;

const MANIFEST_PATH =
  process.env.CENTRY_REWARD_MANIFEST_PATH ||
  "keeper/reward-manifest.json";

const ALLOCATIONS_PATH =
  process.env.CENTRY_REWARD_ALLOCATIONS_PATH ||
  "keeper/reward-allocations.json";

const EXPECTED_CHAIN_ID = 5042002n;
const REWARDS = "0x06e627ce43F2ddd37e8f196824f7049416c3025b";
const LENDING_POOL = "0x90C935687D91b3352b2C55cd79389C92950D94BD";
const CENT = "0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3";
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const USDC = "0x3600000000000000000000000000000000000000";
const UNITFLOW_SWAP_ROUTER = "0x4AA8c7Ac458479d9A4FA5c1481e03061ac76824A";

const SLIPPAGE_BPS = BigInt(
  process.env.CENTRY_REPAY_SLIPPAGE_BPS || "100"
);

function readJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  if (!RPC_URL) {
    throw new Error("Missing ARC_RPC_URL");
  }

  if (SLIPPAGE_BPS < 0n || SLIPPAGE_BPS >= 10_000n) {
    throw new Error("CENTRY_REPAY_SLIPPAGE_BPS must be between 0 and 9999");
  }

  const manifest = readJson(MANIFEST_PATH);
  const allocations = readJson(ALLOCATIONS_PATH);
  const epoch = BigInt(manifest.epoch);

  if (epoch <= 0n) {
    throw new Error("Manifest epoch must be greater than zero");
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

  const lendingPool = new ethers.Contract(
    LENDING_POOL,
    ["function borrowBalance(address borrower,address asset) view returns (uint256)"],
    provider
  );

  // UnitFlow v2.5 exposes the standard exact-input quote interface on its swap router.
  const swapRouter = new ethers.Contract(
    UNITFLOW_SWAP_ROUTER,
    ["function getAmountsOut(uint256 amountIn,address[] calldata path) view returns (uint256[] memory amounts)"],
    provider
  );

  const updatedPositions = [];

  for (const position of manifest.positions) {
    const tokenId = BigInt(position.tokenId);
    const owner = allocations.positions.find(
      (item) => BigInt(item.tokenId) === tokenId
    )?.owner;

    if (!owner || !ethers.isAddress(owner)) {
      throw new Error(`Missing valid owner for token ${tokenId}`);
    }

    const rewardAmount = BigInt(position.amount);
    const currentDebt = await lendingPool.borrowBalance(owner, USDC);

    if (rewardAmount <= 0n) {
      updatedPositions.push({
        ...position,
        instructions: []
      });
      continue;
    }

    if (currentDebt === 0n) {
      console.log(`tokenId ${tokenId}: no USDC debt; no self-repay instruction`);
      updatedPositions.push({
        ...position,
        instructions: []
      });
      continue;
    }

    // Swap the entire reward allocation. The executor repays only the actual debt
    // and sends any excess USDC to the borrower.
    const path = [CENT, WUSDC];
    let quotedWusdc;

    try {
      const quoted = await swapRouter.getAmountsOut(rewardAmount, path);
      quotedWusdc = BigInt(quoted[quoted.length - 1]);
    } catch (error) {
      throw new Error(
        `tokenId ${tokenId}: UnitFlow quote failed for CENT -> WUSDC: ${error.shortMessage || error.message}`
      );
    }

    if (quotedWusdc <= 0n) {
      throw new Error(`tokenId ${tokenId}: UnitFlow returned zero WUSDC quote`);
    }

    // WUSDC uses 18-decimal accounting in the AMM while the Arc native-USDC
    // ERC-20 interface consumed by LendingPool uses 6-decimal accounting.
    const quotedUsdc = quotedWusdc / 1_000_000_000_000n;

    if (quotedUsdc <= 0n) {
      throw new Error(`tokenId ${tokenId}: quoted USDC output is below one raw unit`);
    }

    const minDebtAssetOut =
      quotedUsdc * (10_000n - SLIPPAGE_BPS) / 10_000n;

    if (minDebtAssetOut <= 0n) {
      throw new Error(`tokenId ${tokenId}: computed minDebtAssetOut is zero`);
    }

    console.log(
      `tokenId ${tokenId}: debt=${currentDebt.toString()} reward=${rewardAmount.toString()} quote=${quotedUsdc.toString()} minOut=${minDebtAssetOut.toString()}`
    );

    updatedPositions.push({
      ...position,
      instructions: [
        {
          debtAsset: USDC,
          rewardAmountIn: rewardAmount.toString(),
          minDebtAssetOut: minDebtAssetOut.toString(),
          // Empty swapData makes the deployed adapter use its safe default
          // WUSDC -> CENT reverse-route configuration for CENT -> WUSDC.
          swapData: "0x"
        }
      ]
    });
  }

  manifest.positions = updatedPositions;
  manifest.selfRepay = {
    debtAsset: USDC,
    quoteSource: "UnitFlow v2.5 swap router",
    slippageBps: SLIPPAGE_BPS.toString(),
    generatedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  console.log(`Updated ${updatedPositions.length} manifest position(s).`);
  console.log(`Manifest root unchanged: ${manifest.root}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
