# Centry system design

Centry is a non-custodial lending and onchain-agent protocol built around user-owned smart accounts. This document defines the system boundaries and reliability model for the application and agent runtime.

## Design principles

1. **Modularization** — protocol contracts, application APIs, persistence, runner logic, and frontend surfaces stay independently changeable.
2. **Layering** — separate user intent, policy evaluation, transaction construction, authorization, simulation, and broadcast.
3. **Security as a boundary** — the smart account and its live onchain permissions are the final authority.
4. **Asynchronous work** — user chat and agent-to-agent work enter a durable task queue instead of depending on a long synchronous request.
5. **Fault tolerance** — tasks use leases and bounded external calls so crashed workers and slow providers can recover.
6. **Observability** — every run and action has durable status/proof data in D1.
7. **Iterative design** — reliability improvements land as small migrations while deployed protocol contracts remain unchanged.

The attached system-design material emphasizes modularization, layering, scalability, performance, security, fault tolerance, queues, databases, documentation, and iterative validation. fileciteturn401file1L29-L51 fileciteturn401file1L78-L108 fileciteturn401file1L258-L287

## Current architecture

~~~text
                        +-----------------------------+
                        |          Next.js UI         |
                        | wallet / agents / portfolio |
                        +--------------+--------------+
                                       | HTTPS
                                       v
                        +-----------------------------+
                        |       Application API       |
                        | auth / validation / intent  |
                        +--------------+--------------+
                                       |
                    +------------------+------------------+
                    |                                     |
                    v                                     v
          +-------------------+                +-------------------+
          |   Agent D1 Store  |                |   Agent Runner    |
          | agents / tasks /  |<-------------->| scheduler / AI /  |
          | runs / receipts   |                | policy / execution|
          +-------------------+                +---------+---------+
                                                         |
                                      fixed actions + live checks
                                                         |
                                                         v
                                             +----------------------+
                                             | Centry Smart Account |
                                             | owner / operators /  |
                                             | target + selector    |
                                             | permissions          |
                                             +----------+-----------+
                                                        |
                                                        v
                                             +----------------------+
                                             | Arc Mainnet contracts|
                                             | lending / oracle /   |
                                             | swap / governance    |
                                             +----------------------+
~~~

The critical property is that the runner is not the authority. It proposes a bounded action, then the smart account live policy is checked again immediately before submission.

## Durable task model

~~~text
pending
  |
  | atomic lease
  v
processing -----------------------------+
  |                                     | lease expires
  | successful completion               |
  v                                     |
completed                              |
                                        +----> processing again
                                                 |
                                                 +----> completed / failed
~~~

A task claim records a unique lease identifier, an expiry timestamp, and an incremented attempt count. Completion requires the same lease identifier. A worker that loses its lease cannot mark work complete after another worker has reclaimed it.

This fixes the queue failure mode where two scheduler invocations both observe the same pending task and execute it twice.

## Asynchronous request model

### User chat

The browser receives an accepted response quickly. Work is persisted first, then the runner processes it asynchronously. The browser must not invent a completed response when the runner is slow; completion comes from persisted task state and assistant-message state.

### Autonomous scheduling

The cron scheduler wakes the runner, which claims available tasks and evaluates current onchain state. The runner can also act without queued tasks when persistent autonomy or deterministic position protection requires evaluation.

### External AI providers

AI providers are external dependencies and are bounded by an explicit timeout. A provider that exceeds the runtime budget becomes a recoverable task/run failure instead of holding the worker indefinitely.

## Execution pipeline

~~~text
intent
  -> deterministic parsing / fixed action catalog
  -> policy checks
  -> live operator + account checks
  -> live permission checks
  -> transaction simulation
  -> durable action receipt
  -> broadcast
  -> receipt confirmation
  -> task/run completion
~~~

AI output must never bypass this sequence.

## Concurrency model

**Per-agent lock** prevents two runner cycles from evaluating and acting on the same agent concurrently.

**Transaction mutex** serializes broadcasts from the shared runner signer so separate agents cannot race the same EOA nonce.

The per-agent lock is now aligned with the task lease window. The transaction mutex remains limited to the final validation, simulation, broadcast, and confirmation critical section.

## Data ownership

D1 stores application/runtime state such as agent configuration, queued tasks and leases, run records, action receipts, and runtime proof.

Arc remains authoritative for account ownership, operator authorization, active state, target/function permissions, balances, lending state, and final transaction execution.

This prevents delayed or stale application state from becoming an authorization source.

## Failure model

**Transient dependency failure** — RPC throttling, provider timeout, or temporary network failure. Retry or allow the task lease to expire for reclamation.

**Authorization failure** — the account is inactive, operator authorization was revoked, or a call is outside current permission. Stop the action and surface the reason.

**Simulation failure** — the proposed action is not currently executable. Do not broadcast.

**Broadcast failure** — keep the run failed with its proof state intact. Never report success without a confirmed receipt.

**Worker crash** — the task stays processing until its lease expires, then another worker can reclaim it.

## Scaling path

The current architecture is intentionally compact and does not require a fleet of microservices.

1. Keep D1 as the durable control-plane store for the current workload.
2. Increase runner concurrency only while preserving the global transaction mutex.
3. Separate read-heavy API work from mutation/runner work when contention becomes measurable.
4. Introduce a dedicated queue only when D1 task throughput or latency becomes the bottleneck.
5. Add caching for non-authoritative market reads when repeated RPC access becomes a measured cost.
6. Keep authorization and final execution checks at the smart-account boundary.

The system-design reference describes load balancing, queues, and caching as tools for distributed traffic, asynchronous decoupling, and lower latency; Centry should adopt them when workload measurements justify the added complexity. fileciteturn401file1L60-L70 fileciteturn401file1L78-L93

## API reliability rules

Internal service calls should use authenticated requests, bounded request duration, explicit success/error envelopes, bounded input sizes, and idempotent identifiers for retriable mutations.

The D1 task enqueue path uses the task ID as its idempotency key. Retrying the same enqueue request therefore does not create a second task.

## Security rules

Never treat an AI response, browser request, stored configuration, bearer token, task row, or JSON-supplied operator address as execution authority by itself.

The live smart-account policy remains the final authority.

The Web3 reference also distinguishes the architectural goals of decentralized applications from practical security risks such as compromised wallets and immutable records; Centry therefore keeps final execution authority onchain while treating API/session state as sensitive infrastructure state. fileciteturn401file0L54-L66 fileciteturn401file0L195-L207

## New-feature checklist

- Does the feature have a clear module and layer boundary?
- Can it be retried without duplicating a transaction?
- What happens if the worker dies halfway through?
- What happens if an external dependency never responds?
- Is the action still rejected by live onchain permissions when stored configuration is stale?
- Is there durable proof of planned, simulated, broadcast, and confirmed states?
- Is the persistence change backward-compatible?
- Can the feature be disabled without changing deployed protocol contracts?

This document should evolve with the runtime rather than becoming a one-time architecture diagram.