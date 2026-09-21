# Centry    

Centry is a non-custodial lending and onchain-agent protocol built around user-owned smart accounts. The repository contains the protocol contracts, frontend, agent connection layer, keeper infrastructure, deployment documentation, and the external-agent skill.

> **Development status:** Centry is actively being developed and deployed in stages. Existing deployed contracts are kept unchanged while newer application and agent infrastructure is wired to the live Arc Mainnet deployment. Check the deployment documents and network-specific configuration before changing any contract.

## What Centry does

Centry combines four pieces:

- **Lending:** supply, withdraw, borrow, repay, liquidation, reserve caps, oracle-backed pricing, and interest-rate management.
- **Protocol governance:** veCENT voting power, Governor + Timelock governance, proposal voting, quorum, and timelocked execution.
- **Onchain agents:** user-owned smart accounts with explicit operator permissions, bounded native-value limits, batch execution, metadata, and optional ERC-8004 identity registration.
- **Agent connectivity:** a Skill-first connection flow that lets an external AI agent connect to a specific Centry account and use only the capabilities authorized by the user and enforced onchain.

Self-repay and keeper functionality is treated as background protocol infrastructure rather than a user-facing requirement.

## Repository layout

```text
contracts/     Solidity protocol, governance, agent, oracle and adapter contracts
app/            Application routes/components
frontend/      Frontend configuration and UI
agent-runner/    Hosted agent runner
keeper/        Keeper/background execution services
skills/        External-agent skills, including Centry Connect
docs/          Product, architecture and deployment documentation
scripts/       Operational/deployment scripts
lib/           Agent/runtime helpers
```

## Smart-contract architecture

### Core protocol

`contracts/core/` contains the lending and protocol execution layer, including:

- `CentryLendingPool.sol`
- `CentryInterestRateStrategy.sol`
- `CentryUnitFlowSwapAdapter.sol`
- `CentrySelfRepayExecutorV2.sol`
- `CentryRevenueToCENTUnitFlowAdapter.sol`

The lending pool uses bounded reserve accounting and scaled supply/debt balances. Oracle integration supports Chronicle and Chainlink-style aggregator interfaces.

### Governance

The governance stack follows the OpenZeppelin 5.4 Governor + TimelockController model:

```text
veCENT (IVotes)
      │
      ▼
CentryGovernor
      │ successful proposal
      ▼
CentryTimelockController
      │
      ▼
Governance-controlled protocol contracts
```

Current governance parameters in the contracts are:

- voting delay: **1 day**
- voting period: **3 days**
- quorum: **4%** of historical veCENT voting power at the proposal snapshot
- proposal threshold: **0** for the initial bootstrap
- successful proposals: **queued and executed through the timelock**

The full role/bootstrap sequence is documented in [`contracts/GOVERNANCE_DEPLOYMENT.md`](contracts/GOVERNANCE_DEPLOYMENT.md).

### Onchain agents

The agent account stack is:

```text
CentryOnchainAgentFactory
          │
          ├── implementation
          │
          └── user-created clones
                    │
                    ├── owner
                    ├── authorized operator(s)
                    ├── scoped function permissions
                    ├── expiry / native-value limits
                    ├── metadata
                    └── optional ERC-8004 identity
```

Users do **not** deploy an individual implementation manually. The factory deploys one implementation and creates isolated account clones for each user.

`CentryOnchainAgentAccount.sol` supports bounded single calls and batch calls, two-step ownership, operator authorization, per-target/function permissions, and execution checks through `canExecute()`.

## Agent connection model

Centry uses a Skill-first connection flow.

The flow is:

```text
User connects wallet
        │
        ▼
Select agent scopes
        │
        ▼
Authorize operator + permissions onchain
        │
        ▼
Sign Centry connection challenge
        │
        ▼
Centry generates a connection URL / prompt
        │
        ▼
External agent fetches the connection URL
        │
        ▼
Short-lived authenticated session
        │
        ▼
Agent discovers only authorized capabilities
        │
        ▼
Centry prepares bounded transactions
        │
        ▼
Authorized operator signs + broadcasts
```

The connection Skill is [`skills/centry-connect/SKILL.md`](skills/centry-connect/SKILL.md) and is also served by the backend at `/api/v1/skills/centry-connect`.

The API does not expose arbitrary calldata. State-changing requests are limited to known Centry actions, and the smart-account permission policy remains the final authority. The backend also checks the operator's current onchain authorization during authenticated requests.

### Supported agent actions

**Lending**

- approve
- supply
- withdraw
- borrow
- repay

**Swap**

The agent swap path is deliberately bounded to Centry's configured CENT/USDC UnitFlow route. Quotes expose a minimum output and transaction preparation enforces the smart-account's native-value limit.

**Governance**

- read proposal state/details
- cast a vote (`0 = Against`, `1 = For`, `2 = Abstain`)

Proposal creation and arbitrary governance calldata are not exposed through the agent HTTP interface.

## Frontend

The frontend keeps network-specific contract addresses centralized under `frontend/constants/contracts.js`. The current checked-in protocol configuration targets **Arc Mainnet (5042)** and the already-deployed Centry contracts.

When deploying a new mainnet contract, update the appropriate network configuration only after the deployment transaction and verification have been confirmed.

## Development

### Requirements

- Node.js / npm
- Foundry
- Solidity `0.8.24` for the protocol contracts
- A browser wallet such as MetaMask for Remix/manual deployment

### Install

```bash
npm install
```

### Solidity tests

```bash
forge test
```

### Build the Solidity project

```bash
forge build
```

### Frontend

```bash
npm run dev
```

The frontend application lives under `frontend/`.

## Deployment notes

Centry deployments are intentionally incremental.

### Existing deployments

Do not redeploy an already-working protocol contract merely because the repository contains a newer source file. Some contracts have newer implementations in the repository that are intentionally separate from existing deployed instances.

### New governance deployment

Deploy in this order:

1. `CentryTimelockController`
2. `CentryGovernor`
3. Grant the Governor `PROPOSER_ROLE` and `CANCELLER_ROLE`
4. Configure `EXECUTOR_ROLE`
5. Remove temporary bootstrap proposer/canceller permissions
6. Renounce the temporary bootstrap admin role
7. Transfer ownership of governance-controlled contracts to the timelock

See [`contracts/GOVERNANCE_DEPLOYMENT.md`](contracts/GOVERNANCE_DEPLOYMENT.md) for the exact role model and security boundaries.

### New agent deployment

Deploy `CentryOnchainAgentFactory.sol`. The factory constructor takes no parameters. After deployment, read `implementation()` for the implementation address. Individual agent accounts are then created with:

```solidity
createAgentAccount(
    bytes32 templateId,
    bytes32 configHash,
    string calldata metadataURI,
    address initialOperator
)
```

## Security model

Centry is designed around explicit authorization boundaries:

- users retain ownership of their smart accounts;
- external agents operate through separately authorized operator addresses;
- permissions are target/function specific and can have expiry and native-value limits;
- the HTTP agent interface exposes bounded actions instead of arbitrary calldata;
- governance execution is routed through a timelock;
- keeper/self-repay infrastructure does not replace user ownership or governance authority.

Connection credentials, wallet addresses, balances, transaction payloads, and API responses should be treated as private user data.

## Important files

| File | Purpose |
| --- | --- |
| `contracts/core/CentryLendingPool.sol` | Core lending pool |
| `contracts/oracle/CentryOracle.sol` | Oracle integration and validation |
| `contracts/governance/CentryGovernor.sol` | Governance voting/execution |
| `contracts/governance/CentryTimelockController.sol` | Governance timelock |
| `contracts/governance/CentryVotingEscrow.sol` | veCENT voting positions/history |
| `contracts/agents/CentryOnchainAgentAccount.sol` | User-owned agent smart account |
| `contracts/agents/CentryOnchainAgentFactory.sol` | Agent account factory |
| `skills/centry-connect/SKILL.md` | External-agent connection instructions |
| `contracts/GOVERNANCE_DEPLOYMENT.md` | Governance deployment sequence |
| `frontend/constants/contracts.js` | Network-specific frontend addresses |

## Status

The repository currently contains the next-generation agent account/connection infrastructure alongside the established lending protocol. Mainnet deployment of newer governance/agent components is being staged separately from existing deployments.
