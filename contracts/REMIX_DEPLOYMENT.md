# Centry — Remix deployment (Arc Testnet)

> Test on Arc Testnet first. A successful testnet deployment is not a security audit.

## Early withdrawal v2

The v2 veCENT escrow supports penalized early withdrawal: 25% of locked CENT is charged as a fee; 60% of that fee goes to RevenueRewards, 40% to treasury, and 75% of principal returns to the user. Voting power becomes zero immediately and already-published rewards remain claimable by the withdrawn position owner.

Constructor: `CentryVotingEscrow(token_, treasury_)`.

The v2 dependency chain is VotingEscrow -> RevenueRewards -> RevenueEngine -> RevenueToCENT adapter, with SelfRepayExecutorV2 also pointed at the new RevenueRewards.

## 1. Compiler

Use Solidity `0.8.24`.

Compile with the optimizer enabled after the source compiles cleanly without errors.

## 2. Current live Centry deployments

Do not redeploy or edit an already-working live contract unless a separate architectural blocker is identified.

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
0xF8B71bAed42c28e7e376C4DbD4A137047B92a503

RevenueRewards
0x06e627ce43F2ddd37e8f196824f7049416c3025b

SelfRepayExecutorV2
0x02356D1E4557b8D656cE1493D751C914EA84efe7

RevenueEngine
0x6AA8F37c3cAcb31aCa8cB631E618E38425275ea7

CentryRevenueToCENTUnitFlowAdapter
0x27B20DcF9bbD080E992B7CADFd617e7DB3438D8E

Existing self-repay UnitFlow adapter
0x8430a1cF22C1cd09F7B7eD2C3dB0D66020f6F020
```

## 3. UnitFlow deployment

The Arc Testnet UnitFlow UniversalRouter is:

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

The existing tested self-repay route is:

```text
CENT
  -> UnitFlow V2 exact-input (0x08)
  -> WUSDC
  -> UnitFlow unwrap (0x0c)
  -> native USDC
```

The revenue-side route is:

```text
native USDC
  -> UnitFlow wrap native (0x0b)
  -> WUSDC
  -> UnitFlow V2 exact-input (0x08)
  -> CENT
```

## 4. Existing self-repay UnitFlow adapter

Adapter:

```text
0x8430a1cF22C1cd09F7B7eD2C3dB0D66020f6F020
```

It remains dedicated to the self-repay direction and must not be replaced by the revenue-side adapter.

## 5. Revenue-side UnitFlow adapter

`CentryRevenueToCENTUnitFlowAdapter`:

```text
0x27B20DcF9bbD080E992B7CADFd617e7DB3438D8E
```

Constructor configuration used for the deployment:

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

Authorize the RevenueEngine once:

```text
setAuthorizedCaller(
    0x6AA8F37c3cAcb31aCa8cB631E618E38425275ea7
)
```

The adapter accepts Arc native USDC as `tokenIn` and CENT as `tokenOut` only.

## 6. RevenueEngine configuration

RevenueEngine:

```text
0x6AA8F37c3cAcb31aCa8cB631E618E38425275ea7
```

Set the revenue-side acquisition adapter:

```text
setCENTAcquisitionAdapter(
    0x27B20DcF9bbD080E992B7CADFd617e7DB3438D8E
)
```

Enable native USDC as a supported revenue asset:

```text
setRevenueAssetSupported(
    0x3600000000000000000000000000000000000000,
    true
)
```

Set the reward allocation percentage in BPS:

```text
10_000 = 100%
2_000  = 20%
```

Treasury must approve RevenueEngine for the ERC-20 USDC before `pullRevenue()`.

The live tested flow is:

```text
Treasury
  -> RevenueEngine.pullRevenue()
  -> RevenueEngine.allocateRevenue()
  -> RevenueEngine.acquireCENT()
  -> revenue-side UnitFlow adapter
  -> CENT
```

## 7. Reward funding

RevenueRewards:

```text
0x06e627ce43F2ddd37e8f196824f7049416c3025b
```

The rewards contract distributes funded CENT and does not mint reward tokens.

RevenueEngine can fund acquired CENT with:

```text
fundAcquiredCENT(amount)
```

## 8. Reward epoch generation

The repository generates allocations from on-chain state by default.

Run:

```text
npm run generate:rewards
```

The allocation generator automatically reads:

```text
RevenueRewards.latestEpoch()
RevenueRewards.rewardToken()
RevenueRewards.veCENT()
CENT.balanceOf(RevenueRewards)
```

It selects the next free epoch, subtracts outstanding active/pending reward obligations, uses the remaining funded CENT as the default budget, scans active veCENT positions, and allocates proportionally to voting power.

Optional overrides remain available for controlled tests:

```text
CENTRY_REWARD_EPOCH
CENTRY_REWARD_BUDGET
```

Normal operation does not require either variable.

The output is:

```text
keeper/reward-allocations.json
```

Then generate the Merkle manifest:

```text
npm run generate:manifest
```

or both in one command:

```text
npm run generate:rewards
```

## 9. Queue and activate an epoch

After reviewing the generated allocation/manifest, commit the manifest root with:

```text
queueEpoch(
    epoch,
    root,
    rewardBudget
)
```

The reward contract requires the reward-token balance to cover the budget and enforces a two-day root delay.

After the delay:

```text
activateEpoch(epoch)
```

## 10. Self-repay configuration

For veCENT token ID `tokenId`, the current NFT owner enables self-repay with:

```text
setSelfRepayRecipient(
    tokenId,
    0x02356D1E4557b8D656cE1493D751C914EA84efe7
)
```

The existing self-repay adapter remains configured on `SelfRepayExecutorV2`.

USDC debt asset:

```text
setDebtAssetSupported(
    0x3600000000000000000000000000000000000000,
    true
)
```

## 11. Keeper

The current keeper uses the veCENT/RevenueRewards/SelfRepayExecutorV2 architecture.

It consumes the published reward manifest and does not invent reward amounts or proofs.

Required GitHub secrets:

```text
KEEPER_PRIVATE_KEY
ARC_RPC_URL
```

Optional GitHub variables:

```text
CENTRY_MAX_TOKEN_SCAN
CENTRY_MIN_NATIVE_BALANCE
```

The keeper wallet must already be authorized on `SelfRepayExecutorV2`.

## 12. Verification commands

```text
npm run read:reward-epoch
npm run validate:manifest
```

`validate:manifest` checks the manifest structure, Merkle proofs, and—when an RPC URL is available—the active on-chain epoch/root.

## 13. Security gate

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
