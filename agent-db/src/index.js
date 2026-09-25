const OPERATIONS = new Set([
  "get_agent_by_id",
  "get_agent_by_account",
  "list_agents",
  "list_all_agents",
  "upsert_agent",
  "set_agent_active",
  "create_purchase",
  "create_agent_key",
  "list_agent_keys",
  "get_active_agent_key",
  "revoke_agent_key",
  "set_provider_config",
  "list_provider_configs",
  "get_provider_config",
  "add_agent_chat_message",
  "list_agent_chat_messages",
  "try_lock_agent",
  "unlock_agent",
  "create_agent_run",
  "finish_agent_run",
  "list_agent_runs",
  "enqueue_agent_task",
  "claim_agent_tasks",
  "list_pending_agent_tasks",
  "complete_agent_task",
  "get_agent_task",
  "update_agent_config",
  "upsert_agent_runtime",
  "get_agent_runtime",
  "list_action_receipts",
  "create_action_receipt",
  "update_action_receipts",
  "get_protocol_analytics",
]);

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function badRequest(error) {
  return Response.json({ error }, { status: 400 });
}

function ok(result) {
  return Response.json({ ok: true, result });
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name}_required`);
  }
  return value;
}

function boundedText(value, name, maxLength) {
  const text = requireString(value, name);
  if (text.length > maxLength) throw new Error(`${name}_too_long`);
  return text;
}

async function runOperation(db, operation, args) {
  switch (operation) {
    case "get_agent_by_id":
      return await db.prepare(
        "SELECT * FROM centry_agents WHERE id = ? LIMIT 1"
      ).bind(requireString(args.id, "id")).first();

    case "get_agent_by_account":
      return await db.prepare(
        "SELECT * FROM centry_agents WHERE lower(account) = lower(?) LIMIT 1"
      ).bind(requireString(args.account, "account")).first();

    case "list_agents":
      return await db.prepare(
        "SELECT * FROM centry_agents WHERE lower(owner) = lower(?) ORDER BY created_at DESC"
      ).bind(requireString(args.owner, "owner")).all().then((r) => r.results);

    case "list_all_agents":
      return await db.prepare(
        "SELECT * FROM centry_agents ORDER BY created_at DESC"
      ).all().then((r) => r.results);

    case "upsert_agent": {
      const agent = args.agent || {};
      const now = new Date().toISOString();
      return await db.prepare(
        `INSERT INTO centry_agents
          (id, owner, account, type, template_id, name, description, operator, metadata_uri, config_json, price_usd_cents, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(account) DO UPDATE SET
            owner=excluded.owner,
            type=excluded.type,
            template_id=excluded.template_id,
            name=excluded.name,
            description=excluded.description,
            operator=excluded.operator,
            metadata_uri=excluded.metadata_uri,
            config_json=excluded.config_json,
            price_usd_cents=excluded.price_usd_cents,
            active=excluded.active,
            updated_at=excluded.updated_at`
      ).bind(
        requireString(agent.id, "id"),
        requireString(agent.owner, "owner"),
        requireString(agent.account, "account"),
        requireString(agent.type, "type"),
        requireString(agent.templateId, "templateId"),
        requireString(agent.name, "name"),
        agent.description || "",
        agent.operator || null,
        agent.metadataURI || "",
        JSON.stringify(agent.config || {}),
        Number(agent.priceUsdCents || 0),
        agent.active ? 1 : 0,
        agent.createdAt || now,
        now,
      ).run().then(() => db.prepare(
        "SELECT * FROM centry_agents WHERE lower(account) = lower(?) LIMIT 1"
      ).bind(agent.account).first());
    }

    case "set_agent_active": {
      const id = requireString(args.id, "id");
      await db.prepare(
        "UPDATE centry_agents SET active = ?, updated_at = ? WHERE id = ?"
      ).bind(args.active ? 1 : 0, new Date().toISOString(), id).run();
      return await db.prepare(
        "SELECT * FROM centry_agents WHERE id = ? LIMIT 1"
      ).bind(id).first();
    }

    case "create_purchase": {
      const purchase = args.purchase || {};
      const createdAt = new Date().toISOString();
      await db.prepare(
        "INSERT INTO centry_agent_purchases (id, owner, agent_id, template_id, payment_tx_hash, amount_usdc_raw, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        requireString(purchase.id, "id"),
        requireString(purchase.owner, "owner"),
        requireString(purchase.agentId, "agentId"),
        requireString(purchase.templateId, "templateId"),
        requireString(purchase.paymentTxHash, "paymentTxHash"),
        requireString(String(purchase.amountUsdcRaw), "amountUsdcRaw"),
        purchase.status || "confirmed",
        createdAt,
      ).run();
      return purchase;
    }

    case "create_agent_key":
      await db.prepare(
        "INSERT INTO centry_agent_keys (id, agent_id, owner, operator, label, key_hash, scopes_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        requireString(args.id, "id"),
        requireString(args.agentId, "agentId"),
        requireString(args.owner, "owner"),
        args.operator || null,
        args.label || "External agent",
        requireString(args.keyHash, "keyHash"),
        JSON.stringify(args.scopes || ["read"]),
        new Date().toISOString(),
      ).run();
      return { id: args.id };

    case "list_agent_keys":
      return await db.prepare(
        "SELECT id, agent_id, owner, operator, label, scopes_json, created_at, revoked_at FROM centry_agent_keys WHERE agent_id = ? ORDER BY created_at DESC"
      ).bind(requireString(args.agentId, "agentId")).all().then((r) => r.results);

    case "get_active_agent_key":
      return await db.prepare(
        "SELECT * FROM centry_agent_keys WHERE id = ? AND revoked_at IS NULL LIMIT 1"
      ).bind(requireString(args.id, "id")).first();

    case "revoke_agent_key": {
      const id = requireString(args.id, "id");
      await db.prepare(
        "UPDATE centry_agent_keys SET revoked_at = ? WHERE id = ?"
      ).bind(args.revokedAt || new Date().toISOString(), id).run();
      return { id };
    }

    case "set_provider_config":
      await db.prepare(
        `INSERT INTO centry_agent_providers (agent_id, provider, model, encrypted_api_key, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(agent_id, provider) DO UPDATE SET
           model=excluded.model,
           encrypted_api_key=excluded.encrypted_api_key,
           updated_at=excluded.updated_at`
      ).bind(
        requireString(args.agentId, "agentId"),
        requireString(args.provider, "provider"),
        requireString(args.model, "model"),
        requireString(args.encryptedApiKey, "encryptedApiKey"),
        new Date().toISOString(),
      ).run();
      return { agentId: args.agentId, provider: args.provider, model: args.model };

    case "list_provider_configs":
      return await db.prepare(
        "SELECT agent_id, provider, model, updated_at FROM centry_agent_providers WHERE agent_id = ? ORDER BY provider"
      ).bind(requireString(args.agentId, "agentId")).all().then((r) => r.results);

    case "get_provider_config":
      return await db.prepare(
        "SELECT * FROM centry_agent_providers WHERE agent_id = ? AND provider = ? LIMIT 1"
      ).bind(
        requireString(args.agentId, "agentId"),
        requireString(args.provider, "provider"),
      ).first();

    case "add_agent_chat_message":
      await db.prepare(
        "INSERT INTO centry_agent_chats (id, agent_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(
        requireString(args.id, "id"),
        requireString(args.agentId, "agentId"),
        requireString(args.role, "role"),
        requireString(args.content, "content"),
        new Date().toISOString(),
      ).run();
      return { id: args.id };

    case "list_agent_chat_messages": {
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 50));
      return await db.prepare(
        "SELECT role, content, created_at FROM centry_agent_chats WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?"
      ).bind(requireString(args.agentId, "agentId"), limit).all().then((r) => [...r.results].reverse());
    }

    case "try_lock_agent": {
      const agentId = requireString(args.agentId, "agentId");
      const now = Date.now();
      const ttlMs = Math.max(5_000, Math.min(300_000, Number(args.ttlMs) || 50_000));
      const lockedUntil = now + ttlMs;
      const result = await db.prepare(
        `INSERT INTO centry_agent_locks (agent_id, locked_until, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           locked_until=excluded.locked_until,
           updated_at=excluded.updated_at
         WHERE centry_agent_locks.locked_until < ?`
      ).bind(agentId, lockedUntil, new Date().toISOString(), now).run();
      return Number(result?.meta?.changes || 0) > 0;
    }

    case "unlock_agent": {
      const agentId = requireString(args.agentId, "agentId");
      await db.prepare(
        "UPDATE centry_agent_locks SET locked_until = 0, updated_at = ? WHERE agent_id = ?"
      ).bind(new Date().toISOString(), agentId).run();
      return true;
    }

    case "create_agent_run": {
      const run = args.run || {};
      const now = new Date().toISOString();
      await db.prepare(
        `INSERT INTO centry_agent_runs
          (id, agent_id, cycle_key, status, task_count, action_count, tx_hash, reason, error, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        requireString(run.id, "id"),
        requireString(run.agentId, "agentId"),
        requireString(run.cycleKey, "cycleKey"),
        requireString(run.status || "running", "status"),
        Number(run.taskCount || 0),
        Number(run.actionCount || 0),
        run.txHash || null,
        run.reason || "",
        run.error || "",
        run.startedAt || now,
        run.finishedAt || null,
      ).run();
      return { id: run.id };
    }

    case "list_agent_runs": {
      const agentId = requireString(args.agentId, "agentId");
      const limit = Math.max(1, Math.min(50, Number(args.limit) || 10));
      return await db.prepare(
        `SELECT id, agent_id, cycle_key, status, task_count, action_count, tx_hash, reason, error, started_at, finished_at
         FROM centry_agent_runs
         WHERE agent_id = ?
         ORDER BY started_at DESC
         LIMIT ?`
      ).bind(agentId, limit).all().then((r) => r.results || []);
    }

    case "finish_agent_run": {
      const run = args.run || {};
      const now = new Date().toISOString();
      await db.prepare(
        `UPDATE centry_agent_runs
         SET status = ?, task_count = ?, action_count = ?, tx_hash = ?, reason = ?, error = ?, finished_at = ?
         WHERE id = ?`
      ).bind(
        requireString(run.status, "status"),
        Number(run.taskCount || 0),
        Number(run.actionCount || 0),
        run.txHash || null,
        run.reason || "",
        run.error || "",
        run.finishedAt || now,
        requireString(run.id, "id"),
      ).run();
      return { id: run.id };
    }

    case "enqueue_agent_task": {
      const task = args.task || {};
      const id = requireString(task.id, "id");
      const fromAgentId = task.fromAgentId ? String(task.fromAgentId) : null;
      const toAgentId = requireString(task.toAgentId, "toAgentId");
      const body = boundedText(task.task, "task", 4000);
      const createdAt = new Date().toISOString();
      await db.prepare(
        `INSERT OR IGNORE INTO centry_agent_tasks
          (id, from_agent_id, to_agent_id, task, status, result, created_at, updated_at, completed_at,
           lease_id, lease_until, attempts, last_error)
         VALUES (?, ?, ?, ?, 'pending', '', ?, ?, NULL, NULL, NULL, 0, '')`
      ).bind(id, fromAgentId, toAgentId, body, createdAt, createdAt).run();
      return await db.prepare(
        "SELECT id, from_agent_id, to_agent_id, task, status, result, created_at, updated_at, completed_at, attempts, last_error FROM centry_agent_tasks WHERE id = ? LIMIT 1"
      ).bind(id).first();
    }

    case "claim_agent_tasks": {
      const agentId = requireString(args.agentId, "agentId");
      const leaseId = requireString(args.leaseId, "leaseId");
      const now = Date.now();
      const leaseMs = Math.max(30_000, Math.min(600_000, Number(args.leaseMs) || 300_000));
      const leaseUntil = now + leaseMs;
      const taskId = args.taskId ? String(args.taskId).trim() : null;
      const limit = taskId ? 1 : Math.max(1, Math.min(20, Number(args.limit) || 20));
      const idFilter = taskId ? "AND id = ?" : "";
      const bindings = taskId
        ? [agentId, now, taskId, limit]
        : [agentId, now, limit];

      await db.prepare(
        `UPDATE centry_agent_tasks
         SET status = 'processing',
             lease_id = ?,
             lease_until = ?,
             attempts = attempts + 1,
             updated_at = ?
         WHERE id IN (
           SELECT id
           FROM centry_agent_tasks
           WHERE to_agent_id = ?
             AND (status = 'pending' OR (status = 'processing' AND COALESCE(lease_until, 0) < ?))
             ${idFilter}
           ORDER BY created_at ASC
           LIMIT ?
         )
           AND to_agent_id = ?
           AND (status = 'pending' OR (status = 'processing' AND COALESCE(lease_until, 0) < ?))`
      ).bind(
        leaseId,
        leaseUntil,
        new Date().toISOString(),
        ...bindings,
        agentId,
        now,
      ).run();

      return await db.prepare(
        `SELECT id, from_agent_id, to_agent_id, task, status, result, created_at, updated_at, completed_at,
                lease_id, lease_until, attempts, last_error
         FROM centry_agent_tasks
         WHERE to_agent_id = ? AND lease_id = ? AND status = 'processing'
         ORDER BY created_at ASC`
      ).bind(agentId, leaseId).all().then((r) => r.results || []);
    }

    case "list_pending_agent_tasks": {
      const limit = Math.max(1, Math.min(50, Number(args.limit) || 20));
      return await db.prepare(
        `SELECT id, from_agent_id, to_agent_id, task, status, result, created_at, updated_at, completed_at
         FROM centry_agent_tasks
         WHERE to_agent_id = ? AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT ?`
      ).bind(requireString(args.agentId, "agentId"), limit).all().then((r) => r.results);
    }

    case "complete_agent_task": {
      const id = requireString(args.id, "id");
      const leaseId = requireString(args.leaseId, "leaseId");
      const status = requireString(args.status, "status");
      if (!["completed", "failed"].includes(status)) throw new Error("invalid_task_status");
      const result = typeof args.result === "string" ? args.result.slice(0, 8000) : JSON.stringify(args.result || "");
      const now = new Date().toISOString();
      const update = await db.prepare(
        `UPDATE centry_agent_tasks
         SET status = ?, result = ?, updated_at = ?, completed_at = ?, lease_id = NULL, lease_until = NULL
         WHERE id = ? AND status = 'processing' AND lease_id = ?`
      ).bind(status, result, now, now, id, leaseId).run();
      if (Number(update?.meta?.changes || 0) !== 1) throw new Error("agent_task_lease_lost");
      return { id, status };
    }

    case "upsert_agent_runtime": {
      const runtime = args.runtime || {};
      const agentId = requireString(runtime.agentId, "agentId");
      const now = new Date().toISOString();
      await db.prepare(
        `INSERT INTO centry_agent_runtime
          (agent_id, heartbeat_at, last_evaluation_at, last_action_at, last_success_at, last_failure_at,
           last_status, last_reason, last_error, last_tx_hash, last_run_id, operator_authorized, account_active,
           strategy_state_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id) DO UPDATE SET
           heartbeat_at=excluded.heartbeat_at,
           last_evaluation_at=excluded.last_evaluation_at,
           last_action_at=excluded.last_action_at,
           last_success_at=excluded.last_success_at,
           last_failure_at=excluded.last_failure_at,
           last_status=excluded.last_status,
           last_reason=excluded.last_reason,
           last_error=excluded.last_error,
           last_tx_hash=excluded.last_tx_hash,
           last_run_id=excluded.last_run_id,
           operator_authorized=excluded.operator_authorized,
           account_active=excluded.account_active,
           strategy_state_json=excluded.strategy_state_json,
           updated_at=excluded.updated_at`
      ).bind(
        agentId,
        runtime.heartbeatAt || null,
        runtime.lastEvaluationAt || null,
        runtime.lastActionAt || null,
        runtime.lastSuccessAt || null,
        runtime.lastFailureAt || null,
        runtime.lastStatus || "idle",
        String(runtime.lastReason || "").slice(0, 500),
        String(runtime.lastError || "").slice(0, 1000),
        runtime.lastTxHash || null,
        runtime.lastRunId || null,
        runtime.operatorAuthorized == null ? null : (runtime.operatorAuthorized ? 1 : 0),
        runtime.accountActive == null ? null : (runtime.accountActive ? 1 : 0),
        JSON.stringify(runtime.strategyState && typeof runtime.strategyState === "object" ? runtime.strategyState : {}),
        runtime.updatedAt || now,
      ).run();
      return await db.prepare("SELECT * FROM centry_agent_runtime WHERE agent_id = ? LIMIT 1").bind(agentId).first();
    }

    case "get_agent_runtime":
      return await db.prepare("SELECT * FROM centry_agent_runtime WHERE agent_id = ? LIMIT 1")
        .bind(requireString(args.agentId, "agentId")).first();

    case "list_action_receipts": {
      const agentId = requireString(args.agentId, "agentId");
      const limit = Math.max(1, Math.min(100, Number(args.limit) || 20));
      return await db.prepare(
        `SELECT id, run_id, agent_id, action_index, action_type, target, selector, value, status,
                simulation_at, broadcast_at, confirmed_at, tx_hash, error, created_at
         FROM centry_agent_action_receipts
         WHERE agent_id = ?
         ORDER BY created_at DESC, action_index DESC
         LIMIT ?`
      ).bind(agentId, limit).all().then((r) => r.results || []);
    }

    case "create_action_receipt": {
      const receipt = args.receipt || {};
      const now = new Date().toISOString();
      await db.prepare(
        `INSERT INTO centry_agent_action_receipts
          (id, run_id, agent_id, action_index, action_type, target, selector, value, status,
           simulation_at, broadcast_at, confirmed_at, tx_hash, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        requireString(receipt.id, "id"),
        requireString(receipt.runId, "runId"),
        requireString(receipt.agentId, "agentId"),
        Number(receipt.actionIndex || 0),
        requireString(receipt.actionType, "actionType"),
        requireString(receipt.target, "target"),
        requireString(receipt.selector, "selector"),
        String(receipt.value ?? "0"),
        requireString(receipt.status || "planned", "status"),
        receipt.simulationAt || null,
        receipt.broadcastAt || null,
        receipt.confirmedAt || null,
        receipt.txHash || null,
        String(receipt.error || "").slice(0, 1000),
        receipt.createdAt || now,
      ).run();
      return { id: receipt.id };
    }

    case "update_action_receipts": {
      const ids = Array.isArray(args.ids) ? args.ids.map(String).filter(Boolean).slice(0, 32) : [];
      if (!ids.length) return { updated: 0 };
      const fields = [];
      const values = [];
      if (args.status) { fields.push("status = ?"); values.push(String(args.status)); }
      if (args.simulationAt) { fields.push("simulation_at = ?"); values.push(String(args.simulationAt)); }
      if (args.broadcastAt) { fields.push("broadcast_at = ?"); values.push(String(args.broadcastAt)); }
      if (args.confirmedAt) { fields.push("confirmed_at = ?"); values.push(String(args.confirmedAt)); }
      if (args.txHash !== undefined) { fields.push("tx_hash = ?"); values.push(args.txHash || null); }
      if (args.error !== undefined) { fields.push("error = ?"); values.push(String(args.error || "").slice(0, 1000)); }
      if (!fields.length) return { updated: 0 };
      values.push(...ids);
      const placeholders = ids.map(() => "?").join(", ");
      const result = await db.prepare(
        `UPDATE centry_agent_action_receipts SET ${fields.join(", ")} WHERE id IN (${placeholders})`
      ).bind(...values).run();
      return { updated: Number(result?.meta?.changes || 0) };
    }

    case "get_protocol_analytics": {
      const days = Math.max(1, Math.min(90, Number(args.days) || 7));
      const to = Math.floor(Date.now() / 1000);
      const from = to - days * 86400;
      const pointLimit = Math.min(2500, Math.max(48, days * 24 + 24));
      const eventLimit = Math.min(500, Math.max(100, days * 20));

      const [pointsResult, eventResult] = await Promise.all([
        db.prepare(
          `SELECT bucket_start, asset, symbol, decimals, supply_raw, borrow_raw, cash_raw,
                  price_e18, utilization_e18, borrow_rate_e18, supply_rate_e18,
                  supply_usd_e18, borrow_usd_e18, cash_usd_e18,
                  ltv_bps, liquidation_threshold_bps, liquidation_bonus_bps, reserve_factor_bps,
                  supply_cap_raw, borrow_cap_raw, captured_at
           FROM centry_protocol_hourly
           WHERE bucket_start BETWEEN ? AND ?
           ORDER BY CASE WHEN asset = 'TOTAL' THEN 0 ELSE 1 END, bucket_start ASC, asset ASC
           LIMIT ?`
        ).bind(from, to, pointLimit).all(),
        db.prepare(
          `SELECT id, block_number, block_hash, transaction_hash, log_index, timestamp,
                  event_name, asset, asset2, actor, amount_raw, amount2_raw, metadata_json
           FROM centry_protocol_events
           WHERE timestamp BETWEEN ? AND ?
           ORDER BY timestamp DESC, block_number DESC, log_index DESC
           LIMIT ?`
        ).bind(from, to, eventLimit).all(),
      ]);

      const points = (pointsResult.results || []).map((row) => ({
        bucketStart: Number(row.bucket_start),
        asset: row.asset,
        symbol: row.symbol,
        decimals: Number(row.decimals),
        supplyRaw: row.supply_raw,
        borrowRaw: row.borrow_raw,
        cashRaw: row.cash_raw,
        priceE18: row.price_e18,
        utilizationE18: row.utilization_e18,
        borrowRateE18: row.borrow_rate_e18,
        supplyRateE18: row.supply_rate_e18,
        supplyUsdE18: row.supply_usd_e18,
        borrowUsdE18: row.borrow_usd_e18,
        cashUsdE18: row.cash_usd_e18,
        ltvBps: Number(row.ltv_bps),
        liquidationThresholdBps: Number(row.liquidation_threshold_bps),
        liquidationBonusBps: Number(row.liquidation_bonus_bps),
        reserveFactorBps: Number(row.reserve_factor_bps),
        supplyCapRaw: row.supply_cap_raw,
        borrowCapRaw: row.borrow_cap_raw,
        capturedAt: row.captured_at,
      }));

      return {
        from,
        to,
        points,
        events: eventResult.results || [],
      };
    }

    case "update_agent_config": {
      const id = requireString(args.id, "id");
      const config = args.config && typeof args.config === "object" ? args.config : {};
      const now = new Date().toISOString();
      await db.prepare("UPDATE centry_agents SET config_json = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(config), now, id).run();
      return { id, config };
    }

    case "get_agent_task":
      return await db.prepare(
        `SELECT id, from_agent_id, to_agent_id, task, status, result, created_at, updated_at, completed_at
         FROM centry_agent_tasks
         WHERE id = ?
         LIMIT 1`
      ).bind(requireString(args.id, "id")).first();

    default:
      throw new Error("unsupported_operation");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "centry-agent-db" });
    }

    if (request.method !== "POST" || url.pathname !== "/internal/store") {
      return new Response("Not found", { status: 404 });
    }

    const expected = env.CENTRY_AGENT_DB_SECRET || "";
    const authorization = request.headers.get("authorization") || "";
    if (!expected || authorization !== `Bearer ${expected}`) {
      return unauthorized();
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return badRequest("invalid_json");
    }

    const operation = body?.operation;
    if (!OPERATIONS.has(operation)) return badRequest("unsupported_operation");

    try {
      const result = await runOperation(env.DB, operation, body.args || {});
      return ok(result);
    } catch (error) {
      const message = error?.message || "database_error";
      return Response.json({ error: message }, { status: 400 });
    }
  },
};
