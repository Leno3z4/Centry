# Centry interactive agent executor

Interactive owner chat is split from the autonomous scheduler.

- Ordinary conversation is handled directly by the configured AI provider.
- Read-only account data uses direct RPC reads where applicable.
- Explicit onchain requests go directly to this Worker.
- This Worker runs the hardened agent execution engine, including live permission checks, simulation, transaction submission, receipt verification, and action receipts.
- The autonomous runner remains responsible for scheduled/background work and Cron Triggers.

The browser never receives the signing key.

## Secrets

Set on this Worker:

```bash
npx wrangler secret put CENTRY_AGENT_EXECUTOR_HTTP_SECRET
npx wrangler secret put CENTRY_AGENT_EXECUTOR_PRIVATE_KEY
npx wrangler secret put CENTRY_AGENT_ENCRYPTION_KEY
```

For compatibility during rollout, `CENTRY_AGENT_RUNNER_PRIVATE_KEY` may be used as the signer secret, but the executor should eventually use its own dedicated operator key that is authorized on the relevant agent accounts.

## Next.js

Configure:

```text
CENTRY_AGENT_EXECUTOR_URL=https://<executor-worker-host>
CENTRY_AGENT_EXECUTOR_HTTP_SECRET=<same-secret-as-the-worker>
```

The Worker has no Cron Trigger and never waits for the autonomous scheduler.
