# Centry — Band Oracle setup on Arc testnet

Band announced its Arc testnet integration in November 2025 and published an Arc testnet proxy for its USDC/USD feed:

`0x8c064bCf7C0DA3B3b090BAbFE8f3323534D84d68`

Source: https://blog.bandprotocol.com/band-x-arc-testnet/

## Important

This is a testnet integration path. Do not treat the feed or the Centry deployment as production infrastructure without independent verification, oracle monitoring, and security review.

## 1. Deploy the new CentryOracle

Deploy:

`contracts/oracle/CentryOracle.sol`

Constructor:

`initialOwner`

Use the deployer/multisig that will administer the oracle.

## 2. Configure the Band USDC/USD feed

On the newly deployed `CentryOracle`, call `setBandFeed`.

Arguments:

- `asset`: `0x3600000000000000000000000000000000000000`
- `reference`: `0x8c064bCf7C0DA3B3b090BAbFE8f3323534D84d68`
- `baseSymbol`: `USDC`
- `quoteSymbol`: `USD`
- `maxStaleness`: `3600`
- `enabled`: `true`

`3600` is a one-hour maximum staleness window for this testnet configuration. Production values should be chosen from the actual feed behavior and monitoring requirements, not copied blindly.

## 3. Verify the Band feed before deploying the lending pool

Call `bandFeeds(asset)` and confirm the stored reference, symbols, staleness window, and enabled flag.

Then call:

`getPrice(asset)`

The returned value should be a positive 1e18-normalized USDC/USD price and a recent `updatedAt` timestamp.

For a normal USDC/USD result near parity, the price should be close to:

`1000000000000000000`

Do not require the value to be exactly 1.00; use the live feed result and confirm that it is recent and sensible.

## 4. New LendingPool deployment is required

`CentryLendingPool.oracle` is immutable. That means the existing deployed pool cannot be switched from the old oracle to the new Band-enabled oracle.

After the Band-enabled `CentryOracle` is verified, deploy a new `CentryLendingPool` using:

1. `initialOwner`
2. the new Band-enabled `CentryOracle` address
3. the existing `CentryInterestRateStrategy` address, if its configuration is still appropriate
4. the treasury address

Then add the real Arc USDC reserve to the new pool.

## 5. Why this adapter exists

Centry keeps the lending pool independent of the oracle vendor. The pool only reads `CentryOracle.getPrice(asset)`.

The oracle adapter can therefore consume either:

- a Chainlink-style `latestRoundData()` feed, or
- a Band Standard Reference feed.

Band is an integration source, not something the LendingPool needs to know about directly.

## 6. Adding more assets later

For a new supported asset, configure another Band feed with the appropriate base symbol and quote symbol, then add that asset as a reserve in the LendingPool.

Each asset still needs its own risk parameters and feed validation. Do not assume that USDC parameters are appropriate for volatile assets.
