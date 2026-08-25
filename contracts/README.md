# Centry Contracts — Arc-native lending MVP

Centry is a Neverland-inspired lending/tokenomics stack designed for Arc's stablecoin-native environment.

## Scope

- Multi-reserve ERC-20 lending pool
- Supply, borrow, repay, collateral withdrawal and liquidation
- Chainlink-style oracle adapter with stale-price protection
- Immutable two-slope interest-rate model
- Fixed-supply CENT governance/incentive token with Permit
- Non-transferable veCENT voting escrow with linear decay
- Pull-based revenue distribution using timelocked Merkle roots
- Test-only mock ERC-20 and mock oracle

## Arc note

Arc exposes USDC as native gas and also exposes an ERC-20 USDC interface. The lending pool intentionally uses the ERC-20 interface for accounting and transfers. Native USDC is still used to pay transaction fees.

## Security posture

This repository is an engineering MVP, **not an audited production protocol**. Security measures include:

- OpenZeppelin Ownable2Step, Pausable, ReentrancyGuard and SafeERC20
- Checks-effects-interactions around token transfers
- Exact-balance checks to reject fee-on-transfer/rebasing behavior
- Caps on supply, borrowing, reserves and liquidation parameters
- Oracle positive-price and staleness checks
- No upgradeable proxy layer
- Fixed-supply protocol token with no mint function after construction
- Non-transferable vote-escrow NFT to reduce accounting attack surface
- Two-day delay before revenue Merkle roots can become active

Before mainnet use, the protocol still requires independent review/audit, fuzz/property testing, invariant testing, deployment through a multisig/timelock, oracle validation, economic/risk review and controlled limits.

## Production deployment principle

The `CentryLendingPool` owner should be a multisig or timelock, **not a personal hot wallet**. Never put private keys, seed phrases, API secrets or wallet JSON files in this repository.
