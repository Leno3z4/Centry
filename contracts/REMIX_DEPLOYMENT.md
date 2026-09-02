# Centry — Remix deployment (Arc Testnet)

> Test on Arc Testnet first. A successful testnet deployment is not a security audit.

## 1. Compiler

Use Solidity `0.8.24`.

Compile with the optimizer enabled after the source compiles cleanly without errors.

## 2. Existing live Centry deployments

Do not redeploy or edit these unless a separate architectural blocker is identified.

```text
RATE_STRATEGY
0x0e33c05cc844914155B7300aA93085DBB32d4FBE

LENDING_POOL
0x90C935687D91b3352b2C55cd79389C92950D94BD

CENTRY_ORACLE
0xC82424D224dbfBF9D41a9cBe5cA2AdF762572fC6

CENT
0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3

veCENT
0xb39411595eD14991377411bcE52677C05AcE978D

veCENT REWARDS
0x2fA236D227cb139FbA6E43396614cf8E23CF3050

SELF-REPAY EXECUTOR V2
0xfCDBA35d9255927E9226f371761c1A9Ad82cF831
```

## 3. UnitFlow deployment

The verified Arc Testnet UnitFlow UniversalRouter is:

```text
0xEaF3195bE51861632cd32850973C9515DA48e76F
```

WUSDC:

```text
0x911b4000D3422F482F4062a913885f7b035382Df
```

Arc native USDC ERC-20 interface:

```text
0x3600000000000000000000000000000000000000
```

The live tested route is:

```text
CENT
  -> UnitFlow V2 exact-input (command 0x08)
  -> WUSDC
  -> UnitFlow WUSDC unwrap (command 0x0c)
  -> native USDC
```

### Deploy `CentryUnitFlowSwapAdapter`

Constructor arguments:

```text
unitFlowUniversalRouter_
0xEaF3195bE51861632cd32850973C9515DA48e76F

centToken_
0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3

wusdcToken_
0x911b4000D3422F482F4062a913885f7b035382Df

initialOwner_
YOUR ADMIN / DEPLOYER WALLET
```

The adapter deployed for the current testnet configuration is:

```text
0xDc99c84B8B58d0E0f2dA5E29567Be5325b4b3545
```

## 4. Configure the UnitFlow adapter

On `CentryUnitFlowSwapAdapter`:

### A. Authorize SelfRepayExecutorV2

```text
setAuthorizedCaller(
    0xfCDBA35d9255927E9226f371761c1A9Ad82cF831
)
```

### B. Enable native USDC output

```text
setOutputSupported(
    0x3600000000000000000000000000000000000000,
    true
)
```

Do not enable other output assets until their real UnitFlow routes have been tested.

## 5. Configure SelfRepayExecutorV2

On `CentrySelfRepayExecutorV2`:

### A. Set the UnitFlow adapter

```text
setSwapAdapter(
    0xDc99c84B8B58d0E0f2dA5E29567Be5325b4b3545
)
```

### B. Enable USDC as a supported debt asset

```text
setDebtAssetSupported(
    0x3600000000000000000000000000000000000000,
    true
)
```

EURC and CIRBTC should be enabled only after their actual swap routes and minimum-output handling have been tested.

## 6. Configure veCENT

`CentryVotingEscrow` creates transferable ERC-721 veCENT positions. The NFT owner is the current position owner, and the locked CENT is returned to that owner after the lock expires and `withdraw` succeeds.

Set the rewards controller once:

```text
setRewardsController(
    0x2fA236D227cb139FbA6E43396614cf8E23CF3050
)
```

Set the transfer hook once, pointing at the rewards controller:

```text
setTransferHook(
    0x2fA236D227cb139FbA6E43396614cf8E23CF3050
)
```

These setters are one-time configuration points.

## 7. Self-repay configuration per veCENT NFT

The current owner of a veCENT NFT enables self-repay by calling the rewards controller:

```text
setSelfRepayRecipient(
    tokenId,
    0xfCDBA35d9255927E9226f371761c1A9Ad82cF831
)
```

This makes the executor the recipient of claimed CENT rewards for that NFT.

A veCENT transfer clears the old self-repay configuration through the transfer hook.

## 8. Reward funding and epochs

The rewards controller does not mint CENT. It distributes only funded CENT.

The reward flow is:

```text
protocol revenue
    -> approved reward funding
    -> veCENT reward epoch
    -> CENT reward claim
    -> UnitFlow CENT swap
    -> debt-asset repayment
```

Fund the rewards controller with CENT using:

```text
CENT.approve(
    0x2fA236D227cb139FbA6E43396614cf8E23CF3050,
    amount
)

fund(amount)
```

Epochs are queued with a Merkle root and have a two-day activation delay.

## 9. Self-repay execution

`CentrySelfRepayExecutorV2` supports multiple debt assets in one call.

The keeper must provide:

- epoch
- veCENT tokenId
- exact reward amount
- Merkle proof
- one or more swap instructions

Each instruction contains:

```text
debtAsset
rewardAmountIn
minDebtAssetOut
swapData
```

The executor claims the proven reward, swaps CENT through the configured adapter, repays the borrower's debt with `repayFor`, and returns unused debt tokens or unused reward CENT to the borrower.

The keeper must not invent reward amounts or proofs. Those values must come from the published epoch distribution data.

## 10. Keeper

The old factory/vault keeper is legacy and should not be used for the current veCENT architecture.

The current keeper design should discover active veCENT NFTs, determine current ownership, read self-repay configuration and debt state, consume the published reward-claim data, evaluate viable swap routes, and call `executeSelfRepay` only when the route and minimum output are acceptable.

A keeper wallet only submits transactions; it does not own user funds or determine reward entitlement.

## 11. Security gate

Before mainnet:

- independent smart-contract audit
- unit/fuzz/invariant testing
- oracle manipulation and stale-feed testing
- liquidation edge-case testing
- ERC-20 behavior testing
- route/min-output/slippage testing
- multisig/timelock administration
- monitoring and emergency pause procedures

Never commit private keys, seed phrases, or provider credentials to GitHub or frontend code.
