# Centry Contracts — Arc-native lending MVP

Centry is a Neverland-inspired lending/tokenomics stack designed for Arc's stablecoin-native environment.

## Current architecture

- `CentryLendingPool`: multi-reserve supply/borrow/repay/withdraw/liquidation core
- `CentryInterestRateStrategy`: immutable two-slope utilization model
- `CentryOracle`: Chainlink-style adapter with positive-price and stale-price checks
- `CentryToken`: fixed-supply CENT token
- `CentryVotingEscrow`: non-transferable veCENT position with linear voting-power decay
- `CentryRevenueDistributor`: pull-based Merkle revenue distribution with a two-day root delay
- `mocks/`: test-only ERC-20 and oracle contracts

The first deployment deliberately does **not** include the old self-repaying vault or gauge-controller contracts. The frontend is fail-closed around that decision instead of calling stale addresses.

## Arc integration

The lending pool uses the ERC-20 interface for USDC accounting and transfers. Arc's native USDC is still the gas asset. Do not hard-code an old testnet address into application code; supply the actual deployed/testnet asset address through configuration.

## Security posture

This is an engineering MVP, **not an audited production protocol**. It uses OpenZeppelin Ownable2Step, Pausable, ReentrancyGuard and SafeERC20, explicit reserve/borrow caps, oracle freshness checks, exact token-balance deltas, bounded liquidation parameters, no upgradeable proxy, and a fixed-supply governance token.

No smart contract can honestly be guaranteed unhackable. Before mainnet, perform independent audit/review, fuzzing and invariant testing, economic/risk review, oracle validation, and controlled testnet rollout.

## Frontend configuration

The frontend reads addresses from `frontend/.env.local` using the variables in `frontend/.env.example`. Never commit private keys or secrets. Contract addresses are public; wallet private keys are not.

## Production ownership

Use a multisig or timelock as the lending-pool and distributor owner. Do not use a personal hot wallet for privileged protocol administration.
