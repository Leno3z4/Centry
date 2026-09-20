const fs = require("fs");
const { ethers } = require("ethers");

const RPC_URL =
  process.env.ARC_RPC_URL_SECRET || process.env.ARC_RPC_URL_VARIABLE || process.env.ARC_RPC_URL;

const MANIFEST_PATH =
  process.env.CENTRY_REWARD_MANIFEST_PATH || "keeper/reward-manifest.json";

const ALLOCATIONS_PATH =
  process.env.CENTRY_REWARD_ALLOCATIONS_PATH || "keeper/reward-allocations.json";

const EXPECTED_CHAIN_ID = 5042n;
const REWARDS = process.env.CENTRY_REVENUE_REWARDS || "0x0cBb0050cDCCC5D9CE8Ee2C407c8608B042D30D5";
const LENDING_POOL = "0x0ee649E5A95eB9127cB7146b26349a92B68c17A4";
const CENT = "0x75E1C49f3fAebEc149c4c997f209A8e639c2253F";
const USDC = "0x3600000000000000000000000000000000000000";
const UNITFLOW_QUOTER = "0x5AF6E89F0960Ff375AF84d9911D8153ef6240E34";
const UNITFLOW_FEES = [500, 3000, 10000];

const SLIPPAGE_BPS = BigInt(process.env.CENTRY_REPAY_SLIPPAGE_BPS || "100");

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  if (!RPC_URL) throw new Error("Missing ARC_RPC_URL");
  if (SLIPPAGE_BPS < 0n || SLIPPAGE_BPS >= 10_000n) {
    throw new Error("CENTRY_REPAY_SLIPPAGE_BPS must be between 0 and 9999");
  }

  const manifest = readJson(MANIFEST_PATH);
  const allocations = readJson(ALLOCATIONS_PATH);
  const epoch = BigInt(manifest.epoch);

  if (epoch <= 0n) throw new Error("Manifest epoch must be greater than zero");
  if (BigInt(allocations.epoch) !== epoch) throw new Error("Allocation epoch does not match manifest epoch");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`Wrong chain. Expected Arc Mainnet ${EXPECTED_CHAIN_ID}, got ${network.chainId}`);
  }

  const lendingPool = new ethers.Contract(
    LENDING_POOL,
    ["function borrowBalance(address borrower,address asset) view returns (uint256)"],
    provider
  );

  const quoter = new ethers.Contract(
    UNITFLOW_QUOTER,
    ["function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)"],
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
      updatedPositions.push({ ...position, instructions: [] });
      continue;
    }

    if (currentDebt === 0n) {
      console.log(`tokenId ${tokenId}: no USDC debt; no self-repay instruction`);
      updatedPositions.push({ ...position, instructions: [] });
      continue;
    }

    let bestQuote = null;

    for (const fee of UNITFLOW_FEES) {
      const path = ethers.solidityPacked(
        ["address", "uint24", "address"],
        [CENT, fee, USDC]
      );

      try {
        const result = await quoter.quoteExactInput.staticCall(path, rewardAmount);
        const amountOut = BigInt(result[0]);

        if (amountOut > 0n && (!bestQuote || amountOut > bestQuote.amountOut)) {
          bestQuote = { fee, amountOut };
        }
      } catch {}
    }

    if (!bestQuote) {
      throw new Error(`tokenId ${tokenId}: no UnitFlow V3 CENT/USDC quote available`);
    }

    const minDebtAssetOut =
      bestQuote.amountOut *
      (10_000n - SLIPPAGE_BPS) /
      10_000n;

    if (minDebtAssetOut <= 0n) {
      throw new Error(`tokenId ${tokenId}: computed minDebtAssetOut is zero`);
    }

    const deadline =
      BigInt(Math.floor(Date.now() / 1000)) + 300n;

    const swapData =
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint24"],
        [deadline, bestQuote.fee]
      );

    console.log(
      `tokenId ${tokenId}: debt=${currentDebt.toString()} reward=${rewardAmount.toString()} fee=${bestQuote.fee} quote=${bestQuote.amountOut.toString()} minOut=${minDebtAssetOut.toString()}`
    );

    updatedPositions.push({
      ...position,
      instructions: [
        {
          debtAsset: USDC,
          rewardAmountIn: rewardAmount.toString(),
          minDebtAssetOut: minDebtAssetOut.toString(),
          swapData
        }
      ]
    });
  }

  manifest.positions = updatedPositions;
  manifest.selfRepay = {
    debtAsset: USDC,
    quoteSource: "UnitFlow V3 Quoter",
    slippageBps: SLIPPAGE_BPS.toString(),
    generatedAt: new Date().toISOString()
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`Updated ${updatedPositions.length} manifest position(s).`);
  console.log(`Manifest root unchanged: ${manifest.root}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
