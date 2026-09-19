# Centry agents

Centry has two deliberately separate agent systems.

## Offchain agents

An offchain agent is software that runs outside the blockchain. It gets its own Centry agent identity and talks to the Centry API using a user-generated Centry credential.

The API credential is the gateway to the user's permissions. An offchain agent can perform any API-supported account action that the user has permitted. The agent does not receive the user's wallet private key.

Centry should expose:

- agent creation/revocation;
- API credential creation, rotation and revocation;
- per-agent permissions;
- agent activity and analytics;
- a Skill/instruction file describing the Centry API, served by the backend;
- a marketplace for the official Centry Agent.

Third-party AI-provider API keys must not be stored as ordinary database fields. The production design should keep provider secrets in a dedicated secret-management system. Cloudflare Workers Secrets / Secrets Store are one compatible deployment option, but the core Centry data model should remain provider-independent.

## Onchain agents

An onchain agent is a separate blockchain identity/account. Its smart account executes directly against Centry contracts and other EVM contracts. The standard Centry Agent is operated by an authorized operator and is designed to run continuously; the smart account remains the final execution boundary.

The first account primitive in this repository is `CentryOnchainAgentAccount`:

- the user is the account owner;
- one or more agent operator addresses can be authorized;
- permissions are scoped by operator + target contract + function selector;
- permissions can expire;
- a native-value ceiling can be configured for each permission;
- authorized operators can execute single calls or bounded batches;
- the account can receive ERC-721/ERC-1155 assets;
- the account records a template/config fingerprint and metadata URI.

`CentryOnchainAgentFactory` creates isolated user-owned accounts from one reusable implementation through minimal proxies.

This first layer is intentionally generic. It does not hard-code lending, swap or RWA policy into the account. Higher-level agent templates can be layered on later.

## Why the two systems stay separate

An offchain agent uses the backend-served Skill plus the Centry HTTPS API and its user-scoped credential. An onchain agent has a blockchain identity and executes directly against contracts. They may coexist on the same user's Centry account, but neither depends on MCP or on the other.

Onchain agents can call other onchain agents when their configured permissions allow it.

## Wallet/account direction

The account layer is designed so that a user can opt into agent-managed accounts without changing the existing protocol contracts. Future work can add ERC-4337 and/or EIP-7702 support so a user can use smart-account behavior with stronger delegation and, where supported, preserve an existing EOA address.

No core lending, self-repayment, veCENT, rewards, swap or governance logic should be moved into the agent account layer.
