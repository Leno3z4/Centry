# Security checklist

## Before testnet

- Compile every contract with Solidity 0.8.24.
- Replace test-only mocks with production oracle feeds.
- Confirm every reserve uses a canonical ERC-20 interface on Arc.
- Confirm oracle decimals, feed heartbeat and stale-price policy.
- Exercise pause/unpause and liquidation paths.
- Test zero amounts, max uint amounts, caps, stale prices, low health factors and insufficient liquidity.

## Before mainnet

- Use a multisig/timelock as the pool/oracle/distributor owner.
- Do not deploy with an unreviewed oracle address.
- Run static analysis (Slither), fuzzing and invariant testing.
- Obtain an independent smart-contract audit.
- Run an economic/risk review for every reserve's LTV, liquidation threshold, bonus, caps and rate curve.
- Set conservative initial caps and increase them only after monitoring.
- Verify deployment bytecode and source on the Arc explorer.
- Keep an emergency pause procedure and an incident-response runbook.

## Known non-goals

- No upgradeable proxies.
- No arbitrary token rescue function.
- No fee-on-transfer/rebasing reserves.
- No unaudited automated leverage/self-repaying strategy in the initial deployment.
