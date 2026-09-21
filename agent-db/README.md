# Centry agent D1 worker

This Worker is  the persistence boundary for Centry's server-side agent data.

## Setup

1. Create the D1 database:

```bash
cd agent-db
npx wrangler d1 create centry-agents
```

Copy the returned `database_id` into `wrangler.jsonc`.

2. Set the shared secret on the Worker:

```bash
npx wrangler secret put CENTRY_AGENT_DB_SECRET
```

Use the same long-random value in the Next.js runtime as `CENTRY_AGENT_DB_SECRET`.

3. Apply the schema:

```bash
npx wrangler d1 migrations apply centry-agents --remote
```

For local development:

```bash
npx wrangler d1 migrations apply centry-agents --local
```

4. Deploy:

```bash
npx wrangler deploy
```

5. Configure the Centry Next.js runtime:

```text
CENTRY_AGENT_DB_URL=https://<worker-host>/internal/store
CENTRY_AGENT_DB_SECRET=<same-secret-as-the-worker>
```

The Worker only accepts a fixed set of agent-storage operations. It never exposes arbitrary SQL over HTTP.


## Agent runtime configuration

Also configure the Next.js runtime with `CENTRY_AGENT_ENCRYPTION_KEY` (a random 32-byte hex secret) and the Arc RPC URL. Configure the frontend with `NEXT_PUBLIC_CENTRY_AGENT_FACTORY` after the factory is deployed and `NEXT_PUBLIC_CENTRY_AGENT_RUNNER_ADDRESS` with the hosted runner EOA address.

D1 is available on Cloudflare Free and Paid plans. The autonomous runner uses a Cloudflare Cron Trigger to wake every minute; Cron Triggers run on UTC time. The runner and Next.js service share the D1 Worker through the authenticated `/internal/store` endpoint.
