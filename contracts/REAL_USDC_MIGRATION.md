# Centry — Real USDC migration on Arc testnet

This milestone switches the frontend from the Centry mock `mUSDC` reserve to Arc testnet's native USDC asset exposed through its ERC-20 interface.

## Verified Arc testnet USDC

- Chain ID: `5042002`
- ERC-20-compatible USDC address: `0x3600000000000000000000000000000000000000`
- ERC-20 decimals: `6`

Arc's native USDC is also the network gas asset. The ERC-20 interface is the representation Centry's `IERC20` lending pool uses.

## Important: the existing pool must be configured

Changing the frontend address does **not** automatically change reserves in an already deployed `CentryLendingPool`.

The current pool is multi-reserve and does not hard-code mUSDC. The owner can add the real USDC reserve without changing the pool contract.

Before using the updated frontend:

1. Connect the Centry deployer/owner wallet to Arc testnet in Remix.
2. Open the deployed `CentryLendingPool` at the current pool address.
3. Confirm the caller is the pool owner.
4. Open the deployed oracle used by that pool.
5. Set the USDC/USD price to `1e18` for the current testnet smoke test if the oracle is still the mock oracle.
6. Call `addReserve` on the lending pool with the real USDC address.
7. Use conservative testnet caps.
8. Fund the pool with real Arc testnet USDC before testing borrowing.

### Suggested testnet reserve parameters

These are development values only:

- `asset`: `0x3600000000000000000000000000000000000000`
- `ltvBps`: `8000`
- `liquidationThresholdBps`: `8500`
- `liquidationBonusBps`: `10500`
- `reserveFactorBps`: `1000`
- `supplyCap`: `1000000000` (1,000 USDC at 6 decimals)
- `borrowCap`: `800000000` (800 USDC at 6 decimals)

Do not use these parameters as production risk settings.

## Smoke test

1. Obtain Arc testnet USDC from the official testnet faucet.
2. Approve the deployed Centry lending pool to spend USDC through the ERC-20 interface.
3. Supply USDC to the new reserve.
4. Verify the user's USDC supply balance.
5. Make sure the pool has enough USDC liquidity.
6. Borrow a small amount against supported collateral.
7. Verify the USDC debt and health factor.
8. Repay part of the debt.
9. Repay the remainder.
10. Withdraw the remaining supply.

## Production gate

This migration is **testnet only** until all of the following are complete:

- canonical Arc USDC deployment is verified against current Arc/Circle documentation;
- production oracle is deployed and tested;
- oracle staleness and price-normalization checks are configured;
- USDC reserve risk parameters have been reviewed;
- lending and liquidation tests pass;
- contracts have undergone independent security review before mainnet use.
