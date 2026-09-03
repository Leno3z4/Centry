# Centry V2 Keeper Package

This package replaces the legacy factory/vault keeper with the deployed Centry V2 architecture.

## Contracts

- veCENT: `0xF8B71bAed42c28e7e376C4DbD4A137047B92a503`
- RevenueRewards: `0x06e627ce43F2ddd37e8f196824f7049416c3025b`
- SelfRepayExecutorV2: `0x02356D1E4557b8D656cE1493D751C914EA84efe7`
- LendingPool: `0x90C935687D91b3352b2C55cd79389C92950D94BD`

Network: Arc Testnet, chain ID `5042002`.

## GitHub Actions configuration

Required GitHub secret:

- `KEEPER_PRIVATE_KEY`
- `ARC_RPC_URL`

Required GitHub variable or secret:

- `CENTRY_REWARD_MANIFEST_URL`

Optional GitHub variable or secret:

- `CENTRY_MAX_TOKEN_SCAN` (default `1000`)
- `CENTRY_MIN_NATIVE_BALANCE` (default `0.001` native token)

The keeper wallet must already be authorized on `CentrySelfRepayExecutorV2` with:

`setKeeper(keeperAddress, true)`

The executor must already have a swap adapter configured and each supported debt asset must be enabled.

## Reward manifest

The keeper intentionally does not invent reward amounts or Merkle proofs.

The manifest is an externally published JSON document containing:

- an activated `epoch`
- the optional `root` (the keeper also reads the root from-chain)
- each veCENT `tokenId`
- the exact reward `amount`
- the exact Merkle `proof`
- swap instructions for supported debt assets

The workflow checks the manifest epoch/root against on-chain RevenueRewards before executing.

See `reward-manifest.example.json`.

## Important

Do not use the old:

`CENTRY_SELF_REPAYING_FACTORY`

setting. It is no longer used by this V2 keeper.

The revenue engine and reward-root generation remain separate from the keeper. The keeper only executes already-authorized, already-funded, already-proven reward allocations.
