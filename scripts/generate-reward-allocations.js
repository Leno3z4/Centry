const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_URL =
  process.env.ARC_RPC_URL ||
  process.env.ARC_RPC_URL_SECRET;

const VECENT_ADDRESS =
  "0xF8B71bAed42c28e7e376C4DbD4A137047B92a503";

const OUTPUT_PATH =
  process.env.CENTRY_REWARD_ALLOCATIONS_PATH ||
  "keeper/reward-allocations.json";

const EPOCH =
  process.env.CENTRY_REWARD_EPOCH;

const REWARD_BUDGET =
  process.env.CENTRY_REWARD_BUDGET;

const MAX_TOKEN_SCAN =
  BigInt(
    process.env.CENTRY_MAX_TOKEN_SCAN ||
    "1000"
  );

const VECENT_ABI = [
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOfNFT(uint256 tokenId) view returns (uint256)",
  "function locked(uint256 tokenId) view returns (int128 amount,uint256 end)",
  "function votingPower(uint256 tokenId) view returns (uint256)"
];

const ZERO_ADDRESS =
  ethers.ZeroAddress;

function requireValue(
  value,
  name
) {
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

function toBigInt(
  value,
  name
) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(
      `${name} is not a valid integer`
    );
  }
}

async function main() {
  requireValue(
    RPC_URL,
    "ARC_RPC_URL"
  );

  requireValue(
    EPOCH,
    "CENTRY_REWARD_EPOCH"
  );

  requireValue(
    REWARD_BUDGET,
    "CENTRY_REWARD_BUDGET"
  );

  const epoch =
    toBigInt(
      EPOCH,
      "CENTRY_REWARD_EPOCH"
    );

  const rewardBudget =
    toBigInt(
      REWARD_BUDGET,
      "CENTRY_REWARD_BUDGET"
    );

  if (
    epoch <= 0n
  ) {
    throw new Error(
      "Epoch must be greater than zero"
    );
  }

  if (
    rewardBudget <= 0n
  ) {
    throw new Error(
      "Reward budget must be greater than zero"
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
    5042002n
  ) {
    throw new Error(
      `Wrong chain. Expected Arc Testnet 5042002, got ${network.chainId}`
    );
  }

  const veCENT =
    new ethers.Contract(
      VECENT_ADDRESS,
      VECENT_ABI,
      provider
    );

  const nextTokenId =
    await veCENT.nextTokenId();

  const scanLimit =
    nextTokenId <
    MAX_TOKEN_SCAN + 1n
      ? nextTokenId
      : MAX_TOKEN_SCAN + 1n;

  console.log(
    `Scanning token IDs 1 through ${
      scanLimit - 1n
    }`
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
      owner ===
      ZERO_ADDRESS
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

      owner,

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
          ? locked.end.toString()
          : "0"
    });

    totalVotingPower +=
      votingPower;
  }

  if (
    positions.length ===
    0
  ) {
    throw new Error(
      "No active veCENT positions with voting power were found"
    );
  }

  if (
    totalVotingPower <= 0n
  ) {
    throw new Error(
      "Total voting power is zero"
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

  /*
      Allocate reward budget proportionally
      to voting power.

      Integer division can leave a remainder.
      We keep track of it and distribute the
      remainder deterministically to the
      highest-voting-power positions.
  */

  const allocations =
    positions.map(
      (
        position
      ) => {
        const votingPower =
          BigInt(
            position.votingPower
          );

        const amount =
          rewardBudget *
          votingPower /
          totalVotingPower;

        const remainder =
          rewardBudget *
          votingPower %
          totalVotingPower;

        return {
          ...position,

          amount:
            amount.toString(),

          remainder:
            remainder.toString(),

          instructions: []
        };
      }
    );

  let allocated =
    allocations.reduce(
      (
        total,
        position
      ) =>
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
    (
      a,
      b
    ) => {
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

      return (
        BigInt(
          a.tokenId
        ) <
        BigInt(
          b.tokenId
        )
          ? -1
          : 1
      );
    }
  );

  let index =
    0;

  while (
    remainder > 0n
  ) {
    allocations[index]
      .amount =
      (
        BigInt(
          allocations[index]
            .amount
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
      (
        total,
        position
      ) =>
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

  /*
      Remove internal calculation-only fields
      from the final file.
  */

  const outputPositions =
    allocations
      .sort(
        (
          a,
          b
        ) =>
          BigInt(
            a.tokenId
          ) <
          BigInt(
            b.tokenId
          )
            ? -1
            : 1
      )
      .map(
        (
          position
        ) => ({
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
