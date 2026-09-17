const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64urlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function keyFromSecret(secret) {
  if (!secret) throw new Error("CENTRY_AGENT_CONNECTION_SECRET is not configured");
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payload, secret) {
  const encodedPayload = base64urlEncode(textEncoder.encode(JSON.stringify(payload)));
  const key = await keyFromSecret(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(encodedPayload));
  return `${encodedPayload}.${base64urlEncode(new Uint8Array(signature))}`;
}

async function verifyPayload(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, encodedSignature] = parts;
  const key = await keyFromSecret(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlDecode(encodedSignature),
    textEncoder.encode(encodedPayload)
  );
  if (!valid) return null;

  try {
    return JSON.parse(textDecoder.decode(base64urlDecode(encodedPayload)));
  } catch {
    return null;
  }
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return ["read"];
  return [...new Set(scopes.filter((scope) => typeof scope === "string"))].sort();
}

export async function issueAgentChallenge({ owner, account, origin, scopes = ["read"], ttlSeconds = 300 }) {
  if (!owner || !account || !origin) throw new Error("owner, account, and origin are required");

  const normalizedScopes = normalizeScopes(scopes);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    kind: "centry-agent-challenge",
    nonce: crypto.randomUUID(),
    owner,
    account,
    origin,
    scopes: normalizedScopes,
    iat: now,
    exp: now + ttlSeconds,
  };

  const token = await signPayload(payload, process.env.CENTRY_AGENT_CONNECTION_SECRET);
  return { ...payload, token };
}

export async function verifyAgentChallenge(token) {
  const payload = await verifyPayload(token, process.env.CENTRY_AGENT_CONNECTION_SECRET);
  if (!payload || payload.kind !== "centry-agent-challenge") return null;
  if (!Number.isInteger(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (typeof payload.origin !== "string" || !payload.origin) return null;
  if (!Array.isArray(payload.scopes)) return null;
  return { ...payload, scopes: normalizeScopes(payload.scopes) };
}

export async function issueAgentConnection({
  owner,
  account,
  operator = null,
  scopes = [],
  ttlSeconds = 600,
}) {
  if (!owner || !account) throw new Error("owner and account are required");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    kind: "centry-agent-bootstrap",
    connectionId: crypto.randomUUID(),
    owner,
    account,
    operator,
    scopes: normalizeScopes(scopes),
    iat: now,
    exp: now + ttlSeconds,
  };

  return signPayload(payload, process.env.CENTRY_AGENT_CONNECTION_SECRET);
}

export async function verifyAgentConnection(token) {
  const payload = await verifyPayload(token, process.env.CENTRY_AGENT_CONNECTION_SECRET);
  if (!payload || payload.kind !== "centry-agent-bootstrap") return null;
  if (!Number.isInteger(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!Array.isArray(payload.scopes)) return null;
  return { ...payload, scopes: normalizeScopes(payload.scopes) };
}

export async function issueAgentSession(connection, ttlSeconds = 900) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload(
    {
      kind: "centry-agent-session",
      connectionId: connection.connectionId,
      owner: connection.owner,
      account: connection.account,
      operator: connection.operator ?? null,
      scopes: normalizeScopes(connection.scopes ?? []),
      iat: now,
      exp: now + ttlSeconds,
    },
    process.env.CENTRY_AGENT_CONNECTION_SECRET
  );
}

export async function verifyAgentSession(token) {
  const payload = await verifyPayload(token, process.env.CENTRY_AGENT_CONNECTION_SECRET);
  if (!payload || payload.kind !== "centry-agent-session") return null;
  if (!Number.isInteger(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!Array.isArray(payload.scopes)) return null;
  return { ...payload, scopes: normalizeScopes(payload.scopes) };
}
