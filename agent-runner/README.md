# Centry autonomous agent runner

This Worker is the single global scheduler for Centry's user-owned onchain agents.

Every minute:

```text
Cloudflare Cron
  -> load every registered agent
  -> wake all eligible agents
  -> each agent checks its live Arc account state
  -> read pending A2A tasks + its autonomy instructions
  -> call its configured AI provider when work exists
  -> validate every proposed call against onchain permissions
  -> submit directly to Arc RPC from the runner operator wallet
  -> record the run and task results
```

There is one scheduler, not one cron per user.

## Setup

1. Create the D1 database used by `agent-db/` and apply all migrations.
2. Put the same database ID into `wrangler.jsonc`.
3. Create a dedicated runner/operator wallet. Do not use a user owner wallet.
4. Authorize that runner address on purchased agent accounts. New purchases should use this address as `initialOperator`.
5. Fund the runner wallet with Arc native USDC for gas.
6. Set Worker secrets:

```bash
cd agent-runner
npx wrangler secret put CENTRY_AGENT_RUNNER_PRIVATE_KEY
npx wrangler secret put CENTRY_AGENT_ENCRYPTION_KEY
```

`CENTRY_AGENT_ENCRYPTION_KEY` must be the same 32-byte hex key used by the Next.js/API runtime to encrypt agent provider keys.

7. Install and deploy:

```bash
npm install --no-audit --no-fund
npm run check
npx wrangler deploy
```

## Autonomy configuration

An agent's `centry_agents.config_json` can contain:

```json
{
  "autonomy": {
    "enabled": true,
    "instructions": "Monitor my Centry lending position and act only when a clearly defined risk threshold in this instruction is met.",
    "provider": "gemini",
    "maxActions": 4,
    "slippageBps": 50
  }
}
```

With no autonomy instructions and no pending A2A tasks, the agent simply wakes, verifies its onchain state, records an idle run, and goes dormant.

## A2A

The normal A2A endpoint now persists inbound work in D1. The next scheduler tick delivers pending tasks to the recipient agent. Completing a task never changes onchain permissions. The recipient smart account remains the final execution boundary.

## Security

The runner private key is never stored in D1. It is a Cloudflare Worker secret and is only used to sign Arc transactions.

The runner re-checks:

- Arc chain ID
- agent `active()`
- `agentOperators(runnerAddress)`
- `canExecute()` for every generated call

Before broadcasting, the complete batch is simulated against the live smart account. Transactions from the shared runner signer are serialized through a D1 mutex so concurrent agent wakeups cannot race the same EOA nonce.

Cloudflare Workers Free CPU is intentionally not treated as a production target for the autonomous runtime. The agent loop performs database work, RPC reads, AI HTTPS calls, simulation and signing; use a paid Worker plan for the production scheduler.
