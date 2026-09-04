const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URL =
  process.env.ARC_RPC_URL ||
  process.env.ARC_RPC_URL_SECRET ||
  process.env.ARC_RPC_URL_VARIABLE;

const DEFAULT_REWARDS_ADDRESS =
  "0x06e627ce43F2ddd37e8f196824f7049416c3025b";

const REWARDS_ADDRESS =
  process.env.CENTRY_REVENUE_REWARDS ||
  process.env.CENTRY_REWARD_REWARDS_ADDRESS ||
  DEFAULT_REWARDS_ADDRESS;

const OUTPUT_PATH =
  process.env.CENTRY_REWARD_ALLOCATIONS_PATH ||
  "keeper/reward-allocations.json";

const MAX_TOKEN_SCAN =
  BigInt(
    process.env.CENTRY_MAX_TOKEN_SCAN ||
    "1000"
  );

const MAX_EPOCH_SCAN =
  BigInt(
    process.env.CENTRY_MAX_EPOCH_SCAN ||
    "1000"
  );

const EPOCH_LOOKAHEAD =
  BigInt(
    process.env.CENTRY_REWARD_EPOCH_LOOKAHEAD ||
    "100"
  );

const REWARDS_ABI = [
  "function latestEpoch() view returns (uint256)",
  "function rewardToken() view returns (address)",
  "function veCENT() view returns (address)",
  "function epochRewardBudget(uint256 epoch) view returns (uint256)",
  "function epochClaimed(uint256 epoch) view returns (uint256)",
  "function epochRoots(uint256 epoch) view returns (bytes32)",
  "function pendingEpochs(uint256 epoch) view returns (bytes32 root,uint256 rewardBudget,uint40 readyAt)"
];

const VECENT_ABI = [
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOfNFT(uint256 tokenId) view returns (uint256)",
  "function locked(uint256 tokenId) view returns (int128 amount,uint256 end)",
  "function votingPower(uint256 tokenId) view returns (uint256)"
];

const ZERO_ADDRESS =
  ethers.ZeroAddress;

const ZERO_HASH =
  ethers.ZeroHash;

function requireValue(value, name) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    throw new Error(
      `Missing ${name}`
    );
  }

  return value;
}

function toBigInt(value, name) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(
      `${name} is not a valid integer`
    );
  }
}

function normalizeAddress(address, name) {
  if (!ethers.isAddress(address)) {
    throw new Error(
      `${name} is not a valid address`
    );
  }

  return ethers.getAddress(address);
}

async function findNextEpoch(
  rewards,
  latestEpoch
) {
  let epoch =
    latestEpoch + 1n;

  for (
    let checked = 0n;
    checked <= EPOCH_LOOKAHEAD;
    checked++
  ) {
    const activeRoot =
      await rewards.epochRoots(
        epoch
      );

    const pending =
      await rewards.pendingEpochs(
        epoch
      );

    if (
      activeRoot === ZERO_HASH &&
      pending.root === ZERO_HASH
    ) {
      return epoch;
    }

    epoch++;
  }

  throw new Error(
    `Unable to find a free reward epoch within ${EPOCH_LOOKAHEAD.toString()} epochs`
  );
}

async function getOutstandingActiveObligations(
  rewards,
  latestEpoch
) {
  if (
    latestEpoch === 0n
  ) {
    return 0n;
  }

  if (
    latestEpoch > MAX_EPOCH_SCAN
  ) {
    throw new Error(
      `There are ${latestEpoch.toString()} active epochs; increase CENTRY_MAX_EPOCH_SCAN to account for them safely`
    );
  }

  let outstanding =
    0n;

  for (
    let epoch = 1n;
    epoch <= latestEpoch;
    epoch++
  ) {
    const budget =
      await rewards.epochRewardBudget(
        epoch
      );

    const claimed =
      await rewards.epochClaimed(
        epoch
      );

    if (
      budget > claimed
    ) {
      outstanding +=
        budget - claimed;
    }
  }

  return outstanding;
}

async function getPendingObligations(
  rewards,
  nextEpoch
) {
  let outstanding =
    0n;

  const lastEpoch =
    nextEpoch +
    EPOCH_LOOKAHEAD;

  for (
    let epoch = 1n;
    epoch <= lastEpoch;
    epoch++
  ) {
    const pending =
      await rewards.pendingEpochs(
        epoch
      );

    if (
      pending.root !== ZERO_HASH
    ) {
      outstanding +=
        BigInt(
          pending.rewardBudget
        );
    }
  }

  return outstanding;
}

async function resolveRewardBudget(
  rewards,
  rewardToken,
  latestEpoch,
  nextEpoch
) {
  const balance =
    await rewardToken.balanceOf(
      REWARDS_ADDRESS
    );

  const outstandingActive =
    await getOutstandingActiveObligations(
      rewards,
      latestEpoch
    );

  const outstandingPending =
    await getPendingObligations(
      rewards,
      nextEpoch
    );

  const outstanding =
    outstandingActive +
    outstandingPending;

  if (
    balance < outstanding
  ) {
    throw new Error(
      `Reward token balance ${balance.toString()} is below outstanding epoch obligations ${outstanding.toString()}`
    );
  }

  const available =
    balance - outstanding;

  if (
    available <= 0n
  ) {
    throw new Error(
      "No uncommitted reward balance is available for a new epoch"
    );
  }

  const configuredBudget =
    process.env.CENTRY_REWARD_BUDGET;

  if (
    configuredBudget !== undefined &&
    configuredBudget !== ""
  ) {
    const requested =
      toBigInt(
        configuredBudget,
        "CENTRY_REWARD_BUDGET"
      );

    if (
      requested <= 0n
    ) {
      throw new Error(
        "CENTRY_REWARD_BUDGET must be greater than zero"
      );
    }

    if (
      requested > available
    ) {
      throw new Error(
        `CENTRY_REWARD_BUDGET ${requested.toString()} exceeds available uncommitted reward balance ${available.toString()}`
      );
    }

    console.log(
      `Reward budget override: ${requested.toString()}`
    );

    return requested;
  }

  console.log(
    `Funded reward balance: ${balance.toString()}`
  );

  console.log(
    `Outstanding active obligations: ${outstandingActive.toString()}`
  );

  console.log(
    `Outstanding pending obligations: ${outstandingPending.toString()}`
  );

  console.log(
    `Automatically selected uncommitted reward budget: ${available.toString()}`
  );

  return available;
}

async function main() {
  requireValue(
    RPC_URL,
    "ARC_RPC_URL"
  );

  const provider =
    new ethers.JsonRpcProvider(
      RPC_URL
    );

  const network =
    await provider.getNetwork();

  if (
    network.chainId !==
    5042002n
  ) {
    throw new Error(
      `Wrong chain. Expected Arc Testnet 5042002, got ${network.chainId}`
    );
  }

  const rewardsAddress =
    normalizeAddress(
      REWARDS_ADDRESS,
      "Rewards contract"
    );

  const rewards =
    new ethers.Contract(
      rewardsAddress,
      REWARDS_ABI,
      provider
    );

  const latestEpoch =
    await rewards.latestEpoch();

  const rewardTokenAddress =
    normalizeAddress(
      await rewards.rewardToken(),
      "rewardToken()"
    );

  const veCENTAddress =
    normalizeAddress(
      await rewards.veCENT(),
      "veCENT()"
    );

  const rewardToken =
    new ethers.Contract(
      rewardTokenAddress,
      [
        "function balanceOf(address account) view returns (uint256)"
      ],
      provider
    );

  const veCENT =
    new ethers.Contract(
      veCENTAddress,
      VECENT_ABI,
      provider
    );

  const configuredEpoch =
    process.env.CENTRY_REWARD_EPOCH;

  let epoch;

  if (
    configuredEpoch !== undefined &&
    configuredEpoch !== ""
  ) {
    epoch =
      toBigInt(
        configuredEpoch,
        "CENTRY_REWARD_EPOCH"
      );

    if (
      epoch <= 0n
    ) {
      throw new Error(
        "CENTRY_REWARD_EPOCH must be greater than zero"
      );
    }

    const activeRoot =
      await rewards.epochRoots(
        epoch
      );

    const pending =
      await rewards.pendingEpochs(
        epoch
      );

    if (
      activeRoot !== ZERO_HASH ||
      pending.root !== ZERO_HASH
    ) {
      throw new Error(
        `Requested epoch ${epoch.toString()} is already active or queued`
      );
    }

    console.log(
      `Reward epoch override: ${epoch.toString()}`
    );
  } else {
    epoch =
      await findNextEpoch(
        rewards,
        latestEpoch
      );

    console.log(
      `Latest active epoch: ${latestEpoch.toString()}`
    );

    console.log(
      `Automatically selected next free epoch: ${epoch.toString()}`
    );
  }

  const rewardBudget =
    await resolveRewardBudget(
      rewards,
      rewardToken,
      latestEpoch,
      epoch
    );

  const nextTokenId =
    await veCENT.nextTokenId();

  const scanLimit =
    nextTokenId <
    MAX_TOKEN_SCAN + 1n
      ? nextTokenId
      : MAX_TOKEN_SCAN + 1n;

  console.log(
    `Scanning token IDs 1 through ${scanLimit - 1n}`
  );

  const positions = [];

  let totalVotingPower =
    0n;

  for (
    let tokenId = 1n;
    tokenId < scanLimit;
    tokenId++
  ) {
    let owner;

    try {
      owner =
        await veCENT.ownerOf(
          tokenId
        );
    } catch {
      continue;
    }

    if (
      owner === ZERO_ADDRESS
    ) {
      continue;
    }

    let votingPower;

    try {
      votingPower =
        await veCENT.votingPower(
          tokenId
        );
    } catch {
      try {
        votingPower =
          await veCENT.balanceOfNFT(
            tokenId
          );
      } catch {
        console.log(
          `tokenId ${tokenId}: unable to read voting power`
        );

        continue;
      }
    }

    votingPower =
      toBigInt(
        votingPower,
        `voting power for token ${tokenId}`
      );

    if (
      votingPower <= 0n
    ) {
      continue;
    }

    let locked;

    try {
      locked =
        await veCENT.locked(
          tokenId
        );
    } catch {
      locked =
        null;
    }

    positions.push({
      tokenId:
        tokenId.toString(),

      owner:
        normalizeAddress(
          owner,
          `owner for token ${tokenId}`
        ),

      votingPower:
        votingPower.toString(),

      lockedAmount:
        locked
          ? BigInt(
              locked.amount
            ).toString()
          : "0",

      lockEnd:
        locked
          ? BigInt(
              locked.end
            ).toString()
          : "0"
    });

    totalVotingPower +=
      votingPower;
  }

  if (
    positions.length === 0
  ) {
    throw new Error(
      "No active veCENT positions with voting power were found"
    );
  }

  console.log(
    `Eligible positions: ${positions.length}`
  );

  console.log(
    `Total voting power: ${totalVotingPower.toString()}`
  );

  console.log(
    `Reward budget: ${rewardBudget.toString()}`
  );

  const allocations =
    positions.map(
      (position) => {
        const votingPower =
          BigInt(
            position.votingPower
          );

        const scaled =
          rewardBudget *
          votingPower;

        return {
          ...position,

          amount: (
            scaled /
            totalVotingPower
          ).toString(),

          remainder: (
            scaled %
            totalVotingPower
          ).toString(),

          instructions: []
        };
      }
    );

  let allocated =
    allocations.reduce(
      (total, position) =>
        total +
        BigInt(
          position.amount
        ),
      0n
    );

  let remainder =
    rewardBudget -
    allocated;

  allocations.sort(
    (a, b) => {
      const remainderA =
        BigInt(
          a.remainder
        );

      const remainderB =
        BigInt(
          b.remainder
        );

      if (
        remainderA >
        remainderB
      ) {
        return -1;
      }

      if (
        remainderA <
        remainderB
      ) {
        return 1;
      }

      const votingPowerA =
        BigInt(
          a.votingPower
        );

      const votingPowerB =
        BigInt(
          b.votingPower
        );

      if (
        votingPowerA >
        votingPowerB
      ) {
        return -1;
      }

      if (
        votingPowerA <
        votingPowerB
      ) {
        return 1;
      }

      const tokenA =
        BigInt(
          a.tokenId
        );

      const tokenB =
        BigInt(
          b.tokenId
        );

      if (
        tokenA <
        tokenB
      ) {
        return -1;
      }

      if (
        tokenA >
        tokenB
      ) {
        return 1;
      }

      return 0;
    }
  );

  let index =
    0;

  while (
    remainder > 0n
  ) {
    allocations[index].amount =
      (
        BigInt(
          allocations[index].amount
        ) +
        1n
      ).toString();

    remainder--;
    index++;

    if (
      index >=
      allocations.length
    ) {
      index = 0;
    }
  }

  allocated =
    allocations.reduce(
      (total, position) =>
        total +
        BigInt(
          position.amount
        ),
      0n
    );

  if (
    allocated !==
    rewardBudget
  ) {
    throw new Error(
      `Allocation mismatch. Expected ${rewardBudget}, got ${allocated}`
    );
  }

  const outputPositions =
    allocations
      .sort(
        (a, b) => {
          const left =
            BigInt(
              a.tokenId
            );

          const right =
            BigInt(
              b.tokenId
            );

          if (
            left <
            right
          ) {
            return -1;
          }

          if (
            left >
            right
          ) {
            return 1;
          }

          return 0;
        }
      )
      .map(
        (position) => ({
          tokenId:
            position.tokenId,

          owner:
            position.owner,

          votingPower:
            position.votingPower,

          lockedAmount:
            position.lockedAmount,

          lockEnd:
            position.lockEnd,

          amount:
            position.amount,

          instructions: []
        })
      );

  const output = {
    version: 1,

    generatedAt:
      new Date().toISOString(),

    epoch:
      Number(
        epoch
      ),

    rewardBudget:
      rewardBudget.toString(),

    totalVotingPower:
      totalVotingPower.toString(),

    rewardToken:
      rewardTokenAddress,

    revenueRewards:
      rewardsAddress,

    veCENT:
      veCENTAddress,

    source:
      "Centry deterministic voting-power reward allocation",

    positions:
      outputPositions
  };

  fs.mkdirSync(
    path.dirname(
      OUTPUT_PATH
    ),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      output,
      null,
      2
    ) +
    "\n",
    "utf8"
  );

  console.log(
    `Wrote ${outputPositions.length} positions to ${OUTPUT_PATH}`
  );
}

main().catch(
  (error) => {
    console.error(
      error
    );

    process.exit(
      1
    );
  }
);
