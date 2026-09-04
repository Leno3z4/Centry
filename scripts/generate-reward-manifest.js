const fs = require("fs");

const path =
  require("path");

const { ethers } =
  require("ethers");

const INPUT_PATH =
  process.argv[2] ||
  "keeper/reward-allocations.json";

const OUTPUT_PATH =
  process.argv[3] ||
  "keeper/reward-manifest.json";

if (
  !fs.existsSync(
    INPUT_PATH
  )
) {
  throw new Error(
    `Input file not found: ${INPUT_PATH}`
  );
}

const input =
  JSON.parse(
    fs.readFileSync(
      INPUT_PATH,
      "utf8"
    )
  );

if (
  input.epoch === undefined
) {
  throw new Error(
    "Input epoch is missing"
  );
}

if (
  !Array.isArray(
    input.positions
  )
) {
  throw new Error(
    "Input positions array is missing"
  );
}

const epoch =
  Number(
    input.epoch
  );

if (
  !Number.isInteger(epoch) ||
  epoch <= 0
) {
  throw new Error(
    "Epoch must be a positive integer"
  );
}

function leafHash(
  tokenId,
  amount
) {
  const encoded =
    ethers.AbiCoder
      .defaultAbiCoder()
      .encode(
        [
          "uint256",
          "uint256"
        ],
        [
          BigInt(
            tokenId
          ),
          BigInt(
            amount
          )
        ]
      );

  const innerHash =
    ethers.keccak256(
      encoded
    );

  return ethers.keccak256(
    ethers.concat([
      innerHash
    ])
  );
}

function pairHash(
  left,
  right
) {
  let first =
    left;

  let second =
    right;

  if (
    first.toLowerCase() >
    second.toLowerCase()
  ) {
    [
      first,
      second
    ] =
      [
        second,
        first
      ];
  }

  return ethers.keccak256(
    ethers.concat([
      first,
      second
    ])
  );
}

function buildMerkleTree(
  leaves
) {
  if (
    leaves.length ===
    0
  ) {
    throw new Error(
      "Cannot build tree with zero leaves"
    );
  }

  const levels = [];

  let current =
    leaves.map(
      (
        leaf
      ) =>
        leaf.hash
    );

  levels.push(
    current
  );

  while (
    current.length >
    1
  ) {
    const next = [];

    for (
      let i = 0;
      i < current.length;
      i += 2
    ) {
      const left =
        current[i];

      const right =
        current[i + 1];

      if (
        right === undefined
      ) {
        next.push(
          left
        );

        continue;
      }

      next.push(
        pairHash(
          left,
          right
        )
      );
    }

    current =
      next;

    levels.push(
      current
    );
  }

  const proofs =
    new Map();

  for (
    let index = 0;
    index < leaves.length;
    index++
  ) {
    let currentIndex =
      index;

    const proof = [];

    for (
      let level = 0;
      level <
      levels.length - 1;
      level++
    ) {
      const nodes =
        levels[level];

      const siblingIndex =
        currentIndex % 2 ===
        0
          ? currentIndex + 1
          : currentIndex - 1;

      if (
        siblingIndex <
        nodes.length
      ) {
        proof.push(
          nodes[
            siblingIndex
          ]
        );
      }

      currentIndex =
        Math.floor(
          currentIndex /
          2
        );
    }

    proofs.set(
      leaves[index].key,
      proof
    );
  }

  return {
    root:
      current[0],

    proofs
  };
}

const positions =
  input.positions.map(
    (
      position
    ) => {
      if (
        position.tokenId ===
        undefined
      ) {
        throw new Error(
          "Position tokenId is missing"
        );
      }

      if (
        position.amount ===
        undefined
      ) {
        throw new Error(
          `tokenId ${position.tokenId}: amount is missing`
        );
      }

      return {
        tokenId:
          BigInt(
            position.tokenId
          ).toString(),

        amount:
          BigInt(
            position.amount
          ).toString(),

        instructions:
          Array.isArray(
            position.instructions
          )
            ? position.instructions.map(
                (
                  instruction
                ) => ({
                  debtAsset:
                    ethers.getAddress(
                      instruction.debtAsset
                    ),

                  rewardAmountIn:
                    BigInt(
                      instruction.rewardAmountIn
                    ).toString(),

                  minDebtAssetOut:
                    BigInt(
                      instruction.minDebtAssetOut
                    ).toString(),

                  swapData:
                    instruction.swapData ||
                    "0x"
                })
              )
            : []
      };
    }
  );

const duplicateIds =
  new Set();

for (
  const position of
  positions
) {
  if (
    duplicateIds.has(
      position.tokenId
    )
  ) {
    throw new Error(
      `Duplicate tokenId ${position.tokenId}`
    );
  }

  duplicateIds.add(
    position.tokenId
  );
}

const leaves =
  positions
    .map(
      (
        position
      ) => ({
        key:
          position.tokenId,

        hash:
          leafHash(
            position.tokenId,
            position.amount
          )
      })
    )
    .sort(
      (
        a,
        b
      ) => {
        const left =
          BigInt(
            a.key
          );

        const right =
          BigInt(
            b.key
          );

        if (
          left < right
        ) {
          return -1;
        }

        if (
          left > right
        ) {
          return 1;
        }

        return 0;
      }
    );

const {
  root,
  proofs
} =
  buildMerkleTree(
    leaves
  );

const manifest =
  {
    version: 1,

    generatedAt:
      new Date().toISOString(),

    epoch,

    root,

    source:
      input.source ||
      "authoritative Centry reward allocation",

    positions:
      positions.map(
        (
          position
        ) => ({
          tokenId:
            position.tokenId,

          amount:
            position.amount,

          proof:
            proofs.get(
              position.tokenId
            ) || [],

          instructions:
            position.instructions
        })
      )
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
    manifest,
    null,
    2
  ) +
  "\n",
  "utf8"
);

console.log(
  "Reward manifest generated."
);

console.log(
  `Epoch: ${epoch}`
);

console.log(
  `Root: ${root}`
);

console.log(
  `Positions: ${positions.length}`
);

console.log(
  `Output: ${OUTPUT_PATH}`
);
