# Centry — Remix IDE deployment (Arc testnet)

> This is the deployment order for the current MVP. **Do not use mainnet funds.** Deploy and test on Arc testnet first, and only proceed to mainnet after independent audit/review.

## 1. Open Remix

Go to https://remix.ethereum.org.

Create/open a workspace and import the `contracts/` directory from this repository. If you are using GitHub directly, the easiest path is to clone/download the repo locally and open the folder in Remix's File Explorers.

The contracts use pinned OpenZeppelin v5.4.0 GitHub imports, so Remix can resolve dependencies from the source URLs.

## 2. Compiler

Open **Solidity Compiler**.

- Compiler: **0.8.24**
- EVM version: leave at the compiler default unless Arc specifically documents a required target.
- Enable optimization for deployment builds after successful test compilation.

Compile the contracts individually as needed. Start with `CentryMockERC20.sol`, `CentryMockOracle.sol`, `CentryInterestRateStrategy.sol`, `CentryToken.sol`, `CentryLendingPool.sol`, `CentryVotingEscrow.sol`, and `CentryRevenueDistributor.sol`.

## 3. Connect MetaMask to Arc testnet

Use the **current Arc testnet network parameters from the official Arc documentation** rather than copying old RPC/chain-ID values from a random tutorial. Arc's network configuration can change during testnet phases.

Your wallet needs enough Arc testnet USDC for transaction fees/funding as specified by Arc's current faucet/testnet instructions.

In Remix, open **Deploy & Run Transactions** and select **Injected Provider - MetaMask**.

Confirm the account shown in Remix is the intended deployer.

## 4. Test-only deployment order

For a first local/testnet smoke test:

### A. Deploy mock USDC

Contract: `CentryMockERC20`

Example constructor:

- `name`: `Mock USDC`
- `symbol`: `mUSDC`
- `decimals`: `6`
- `initialOwner`: your deployer address

Deploy it, copy the contract address.

### B. Deploy mock oracle

Contract: `CentryMockOracle`

Constructor:

- `owner_`: your deployer address

Copy the address.

### C. Deploy rate strategy

Contract: `CentryInterestRateStrategy`

A conservative test configuration in 1e18 units:

- `baseRatePerYear`: `0`
- `slope1PerYear`: `40000000000000000` (4%)
- `slope2PerYear`: `750000000000000000` (75%)
- `kink`: `800000000000000000` (80%)
- `maxRatePerYear`: `800000000000000000` (80%)

Copy the address.

### D. Deploy the lending pool

Contract: `CentryLendingPool`

Constructor:

1. `initialOwner`: your deployer/multisig address
2. `oracle_`: mock oracle address
3. `rateStrategy_`: rate strategy address
4. `treasury_`: treasury address

For the first test, using the deployer as treasury is acceptable only for a disposable test deployment. For anything persistent, use a separate multisig.

Copy the pool address.

### E. Configure the mock oracle

Call `setPrice` on the mock oracle:

- `asset`: mock USDC address
- `priceE18`: `1000000000000000000` (=$1.00)

### F. Add the reserve

Call `addReserve` on the lending pool.

Conservative test values:

- `asset`: mock USDC
- `ltv`: `8000` (80%)
- `threshold`: `8500` (85%)
- `bonus`: `10500` (5% liquidation bonus)
- `reserveFactor`: `1000` (10%)
- `supplyCap`: `1000000000000` (1,000,000 mUSDC = 1,000 USDC with 6 decimals)
- `borrowCap`: `800000000000` (800 USDC)

These are test values, not recommended production risk parameters.

## 5. Smoke-test lending

1. Call `mint` on `CentryMockERC20` to give the test wallet mUSDC.
2. Call `approve(pool, amount)` from the token.
3. Call `supply(mockUSDC, amount)` on the pool.
4. Confirm `supplyBalance(user, mockUSDC)`.
5. Call `borrow(mockUSDC, amount)` only within the configured LTV and available liquidity.
6. Confirm `borrowBalance(user, mockUSDC)` and `healthFactor(user)`.
7. Approve the pool and call `repay(mockUSDC, amount)`.
8. Call `withdraw(mockUSDC, amount)`.

## 6. Real Arc USDC deployment

Do **not** deploy the mock token or mock oracle as production infrastructure.

Before using real Arc USDC:

1. Obtain the canonical Arc USDC ERC-20 contract address from current official Arc documentation/explorer.
2. Obtain a production-grade oracle feed that is actually deployed and supported on Arc.
3. Confirm the feed's decimals and heartbeat.
4. Deploy `CentryOracle` with the multisig/timelock as owner.
5. Configure the USDC/USD feed with an explicit maximum staleness interval.
6. Verify the oracle returns 1e18-normalized prices.
7. Deploy the lending pool with the production oracle and immutable rate strategy.
8. Start with very small caps.
9. Verify source code and deployment addresses on the Arc explorer.

## 7. Governance/tokenomics

Deploy `CentryToken` with:

- `initialRecipient`: treasury/multisig
- `initialSupply`: your fixed total supply in 18-decimal units

There is intentionally no public mint function.

Then deploy `CentryVotingEscrow` with the CENT address.

The user must approve the veCENT contract to spend CENT before calling `createLock`.

The current MVP supports one lock per wallet and a non-transferable veCENT NFT with linearly decaying voting power.

## 8. Revenue distributor

Deploy `CentryRevenueDistributor` with the multisig/timelock owner.

Fund it with an approved ERC-20 revenue asset, then queue a Merkle root. Roots have a two-day activation delay. Users claim with their Merkle proof.

The Merkle tree generation is intentionally kept off-chain; do not fabricate roots or proofs manually for production.

## 9. Production owner security

After deployment, the contract owner should not remain a normal hot wallet.

Recommended structure:

`Multisig -> Timelock (where appropriate) -> protocol administration`

Keep the deployer wallet separate from the treasury. Never commit a seed phrase/private key to GitHub, Remix, `.env`, or frontend code.

## 10. Before mainnet

A successful Remix deployment is **not** a security audit. Before mainnet:

- Run Slither/static analysis.
- Add unit, fuzz and invariant tests.
- Test liquidation economics with adversarial price moves.
- Test stale and manipulated oracle scenarios.
- Test cap/rate overflow boundaries.
- Test ERC-20 edge cases.
- Perform an independent smart-contract audit.
- Perform an economic/risk review.
- Use multisig/timelock administration.
- Establish monitoring and an emergency pause process.

See `SECURITY.md` for the security gate checklist.
