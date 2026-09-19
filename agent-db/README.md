# Centry agent D1 worker

This Worker is the persistence boundary for Centry's server-side agent data.

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
