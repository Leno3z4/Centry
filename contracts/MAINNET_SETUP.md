# Centry — Arc Mainnet Setup

## Deployed

```text
Timelock
0x9faAD715fCF1cA6EB2f463e0b6344d06249cbb9b

CENT
0x75E1C49f3fAebEc149c4c997f209A8e639c2253F

veCENT
0x3c1771B971329f3eCf9A1bB8B3adC8756e13d334

Governor
0x0F54683a09a73cB60575E0DF36E474D4F9e1157B

InterestRateStrategy
0x7d2d0096Dc5D77A68B821a2308f2A65179c04B76

Oracle
0x00C6d554BD44859349c4aeEA0E8216AE94FC3f84

LendingPool
0x0ee649E5A95eB9127cB7146b26349a92B68c17A4

VeCENTRevenueRewards
0x0cBb0050cDCCC5D9CE8Ee2C407c8608B042D30D5

RevenueEngine
0x994bbDA0C6309F4961B0612096C3B7a56A879AdA

Treasury
0x475a93394F1EDef9255EA565Ee50eb8feaC7744C

Admin
0xd422fc040ad9294d553150Cf5646Ab0B1729E443
```

## Arc Mainnet UnitFlow V3

The Mainnet V3 router currently observed on Arc is:

```text
0x6fD8351b9596C1F0b2f2479BfA6A171cb3d0f410
```

UnitFlow's V3 router interface uses `exactInput` / `exactInputSingle` and V3 paths encoded as token + fee + token. The current UnitFlow source and docs publish testnet deployment data, while the Mainnet router above is present in the live Arc Mainnet deployment. V3 swaps use the ERC-20 token address directly; Centry does not need a separate WUSDC address for the V3 adapters.

Canonical Arc native-USDC ERC-20 interface:

```text
0x3600000000000000000000000000000000000000
```

## Adapter deployments

### Revenue -> CENT

Deploy `CentryRevenueToCENTUnitFlowAdapter` with:

```text
unitFlowRouter_
0x6fD8351b9596C1F0b2f2479BfA6A171cb3d0f410

centToken_
0x75E1C49f3fAebEc149c4c997f209A8e639c2253F

initialOwner_
0xd422fc040ad9294d553150Cf5646Ab0B1729E443
```

Then call:

```text
setAuthorizedCaller(
  0x994bbDA0C6309F4961B0612096C3B7a56A879AdA
)
```

On RevenueEngine call:

```text
setCENTAcquisitionAdapter(REVENUE_ADAPTER)

setRevenueAssetSupported(
  0x3600000000000000000000000000000000000000,
  true
)

setRewardAllocationBps(
  0x3600000000000000000000000000000000000000,
  2000
)
```

### CENT -> USDC self-repay

Deploy `CentryUnitFlowSwapAdapter` with:

```text
unitFlowRouter_
0x6fD8351b9596C1F0b2f2479BfA6A171cb3d0f410

centToken_
0x75E1C49f3fAebEc149c4c997f209A8e639c2253F

initialOwner_
0xd422fc040ad9294d553150Cf5646Ab0B1729E443
```

After the executor is deployed:

```text
setAuthorizedCaller(SELF_REPAY_EXECUTOR)

setOutputSupported(
  0x3600000000000000000000000000000000000000,
  true
)
```

### SelfRepayExecutorV2

Deploy with:

```text
lendingPool_
0x0ee649E5A95eB9127cB7146b26349a92B68c17A4

rewardsController_
0x0cBb0050cDCCC5D9CE8Ee2C407c8608B042D30D5

initialOwner_
0xd422fc040ad9294d553150Cf5646Ab0B1729E443
```

Then:

```text
setSwapAdapter(SELF_REPAY_ADAPTER)

setDebtAssetSupported(
  0x3600000000000000000000000000000000000000,
  true
)

setKeeper(KEEPER_ADDRESS, true)
```

For each veCENT NFT that should use self-repay, its current owner configures the position:

```text
setSelfRepayRecipient(
  tokenId,
  SELF_REPAY_EXECUTOR
)
```

## veCENT wiring

On `CentryVotingEscrow`:

```text
setRewardsController(
  0x0cBb0050cDCCC5D9CE8Ee2C407c8608B042D30D5
)

setTransferHook(
  0x0cBb0050cDCCC5D9CE8Ee2C407c8608B042D30D5
)
```

Both setters are one-time.

## Swap data

Direct V3 pool:

```solidity
abi.encode(deadline, fee)
```

Multi-hop V3 path:

```solidity
abi.encode(deadline, v3Path)
```

where `v3Path` is packed as:

```text
tokenIn (20 bytes) + fee (3 bytes) + tokenOut (20 bytes)
```

Centry validates that the first token and final token are fixed to the intended direction.

## Agent factory

Deploy `CentryOnchainAgentFactory` with no constructor arguments. It deploys the agent-account implementation internally.
