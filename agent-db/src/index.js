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
  "list_pending_agent_tasks",
  "complete_agent_task",
  "get_agent_task",
  "update_agent_config",
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
        `INSERT INTO centry_agent_tasks
          (id, from_agent_id, to_agent_id, task, status, result, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, 'pending', '', ?, ?, NULL)`
      ).bind(id, fromAgentId, toAgentId, body, createdAt, createdAt).run();
      return { id, status: "pending", createdAt };
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
      const status = requireString(args.status, "status");
      if (!["completed", "failed"].includes(status)) throw new Error("invalid_task_status");
      const result = typeof args.result === "string" ? args.result.slice(0, 8000) : JSON.stringify(args.result || "");
      const now = new Date().toISOString();
      await db.prepare(
        `UPDATE centry_agent_tasks
         SET status = ?, result = ?, updated_at = ?, completed_at = ?
         WHERE id = ? AND status = 'pending'`
      ).bind(status, result, now, now, id).run();
      return { id, status };
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
