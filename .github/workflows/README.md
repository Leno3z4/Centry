# Centry V2 Keeper Package

This package replaces the legacy factory/vault keeper with the deployed Centry V2 architecture.

## Contracts

- veCENT: `0x3c1771B971329f3eCf9A1bB8B3adC8756e13d334`
- RevenueRewards: `0x0cBb0050cDCCC5D9CE8Ee2C407c8608B042D30D5`
- SelfRepayExecutorV2: `0x6D87e89C015509F84B4e01b8a193d1A2CcE7De37`
- LendingPool: `0x0ee649E5A95eB9127cB7146b26349a92B68c17A4`

Network: Arc Mainnet, chain ID `5042`.

## GitHub Actions configuration

Required GitHub secrets:

- `KEEPER_PRIVATE_KEY`
- `ARC_RPC_URL`

Optional GitHub variables:

- `CENTRY_MAX_TOKEN_SCAN` (default `1000`)
- `CENTRY_MIN_NATIVE_BALANCE` (default `0.001` native token)

The keeper wallet must already be authorized on `CentrySelfRepayExecutorV2` with:

`setKeeper(keeperAddress, true)`

The executor must already have a swap adapter configured and each supported debt asset must be enabled.

## Reward manifest

The keeper intentionally does not invent reward amounts or Merkle proofs.

The repository now generates the reward allocation and Merkle manifest from on-chain state by default:

```text
npm run generate:rewards
```

The allocation generator automatically:

- reads `latestEpoch()` from RevenueRewards and selects the next free epoch
- reads `rewardToken()` and the funded reward-token balance from RevenueRewards
- subtracts outstanding active and pending epoch obligations before selecting a new budget
- reads the deployed `veCENT()` address from RevenueRewards
- scans active veCENT positions and uses current voting power
- writes `keeper/reward-allocations.json`

`CENTRY_REWARD_EPOCH` and `CENTRY_REWARD_BUDGET` remain optional safety overrides. Normal operation does not require them.

The manifest generator then converts the allocation file into `keeper/reward-manifest.json` with the exact Merkle leaf format expected by RevenueRewards.

Validation remains separate:

```text
npm run validate:manifest
```

Validation requires the epoch to already be active when an RPC URL is supplied; before activation it can still perform structural validation when run without RPC configuration.

## Manual reward workflow

For a newly funded reward epoch:

```text
npm run generate:rewards
```

Then inspect `keeper/reward-allocations.json` and `keeper/reward-manifest.json` before publishing or queuing the root.

The reward root must be queued on RevenueRewards and allowed to pass the two-day root delay before the keeper can execute claims.

## Important

Do not use the old:

`CENTRY_REWARD_MANIFEST_URL`

or:

`CENTRY_SELF_REPAYING_FACTORY`

settings. They are no longer part of the current V2 keeper flow.

The revenue engine and reward-root generation remain separate from the keeper. The keeper only executes already-authorized, already-funded, already-proven reward allocations.
