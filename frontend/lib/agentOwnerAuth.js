import { JsonRpcProvider, Contract, getAddress, isAddress, verifyMessage } from "ethers";
import crypto from "node:crypto";
import { consumeOwnerAuthNonce } from "./agentStore";

const ACCOUNT_ABI = [
  "function owner() view returns (address)",
  "function active() view returns (bool)",
];

const DEFAULT_AGENT_RPC_URL = "https://rpc.mainnet.arc.io";

function secret() {
  return process.env.CENTRY_AGENT_CONNECTION_SECRET || "";
}

function resolveAgentRpcUrl(value) {
  const configured = value || process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL || "";
  try {
    const url = new URL(configured);
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname)) return DEFAULT_AGENT_RPC_URL;
    return url.toString();
  } catch {
    return DEFAULT_AGENT_RPC_URL;
  }
}

function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function canonicalParams(params) {
  return JSON.stringify(canonicalize(params && typeof params === "object" ? params : {}));
}

function paramsHash(params) {
  return crypto.createHash("sha256").update(canonicalParams(params)).digest("hex");
}

function authorizationMessage({ action, account, owner, nonce, exp, params }) {
  return [
    "Centry agent administration",
    "",
    "Action: " + action,
    "Account: " + account,
    "Owner: " + owner,
    "Nonce: " + nonce,
    "Expires: " + exp,
    "Parameters: " + canonicalParams(params),
    "",
    "I authorize this Centry agent administration action with exactly the parameters listed above.",
  ].join("\n");
}

export function issueOwnerChallenge({ owner, account, action, params = {} }) {
  if (!secret()) throw new Error("agent_connection_secret_not_configured");
  const normalizedOwner = getAddress(owner);
  const normalizedAccount = getAddress(account);
  const normalizedParams = canonicalize(params && typeof params === "object" ? params : {});
  const nonce = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 300;
  const payload = { kind: "centry-owner-admin", nonce, owner: normalizedOwner, account: normalizedAccount, action, params: normalizedParams, paramsHash: paramsHash(normalizedParams), exp };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = encoded + "." + sign(encoded);
  const message = authorizationMessage({ action, account: normalizedAccount, owner: normalizedOwner, nonce, exp, params: normalizedParams });
  return { token, message, ...payload };
}

export function verifyOwnerChallenge(token) {
  try {
    const [encoded, sig] = String(token || "").split(".");
    if (!encoded || !sig || !secret() || sign(encoded) !== sig) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.kind !== "centry-owner-admin" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifyOwnerAuthorization({ rpcUrl, challengeToken, signature, owner, account, action, params = {} }) {
  const challenge = verifyOwnerChallenge(challengeToken);
  const normalizedOwner = getAddress(owner);
  const normalizedAccount = getAddress(account);
  const normalizedParams = canonicalize(params && typeof params === "object" ? params : {});
  if (!challenge || challenge.owner.toLowerCase() !== normalizedOwner.toLowerCase() || challenge.account.toLowerCase() !== normalizedAccount.toLowerCase() || challenge.action !== action || challenge.paramsHash !== paramsHash(normalizedParams) || canonicalParams(challenge.params) !== canonicalParams(normalizedParams)) {
    throw new Error("invalid_owner_challenge");
  }

  const message = authorizationMessage({ action: challenge.action, account: challenge.account, owner: challenge.owner, nonce: challenge.nonce, exp: challenge.exp, params: challenge.params });
  const signer = getAddress(verifyMessage(message, signature));
  if (signer.toLowerCase() !== challenge.owner.toLowerCase()) throw new Error("owner_signature_mismatch");

  const provider = new JsonRpcProvider(resolveAgentRpcUrl(rpcUrl));
  const contract = new Contract(challenge.account, ACCOUNT_ABI, provider);
  const [onchainOwner, active] = await Promise.all([contract.owner(), contract.active()]);
  if (getAddress(onchainOwner).toLowerCase() !== signer.toLowerCase()) throw new Error("account_owner_mismatch");

  const consumed = await consumeOwnerAuthNonce({ nonce: challenge.nonce, owner: challenge.owner, account: challenge.account, action: challenge.action, paramsHash: challenge.paramsHash });
  if (!consumed) throw new Error("owner_challenge_replayed");

  return { challenge, active: Boolean(active) };
}

export const OWNER_SESSION_COOKIE = "centry_owner_session";
const OWNER_SESSION_TTL_SECONDS = 60 * 60 * 12;

function encodeSession(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function verifySignature(encoded, supplied) {
  if (!encoded || !supplied || !secret()) return false;
  const expected = sign(encoded);
  const left = Buffer.from(expected);
  const right = Buffer.from(String(supplied));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function issueOwnerSession({ owner }) {
  if (!secret()) throw new Error("agent_connection_secret_not_configured");
  const normalizedOwner = getAddress(owner);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    kind: "centry-owner-session",
    nonce: crypto.randomUUID(),
    owner: normalizedOwner,
    iat: now,
    exp: now + OWNER_SESSION_TTL_SECONDS,
  };
  const encoded = encodeSession(payload);
  return { token: `${encoded}.${sign(encoded)}`, ...payload };
}

export function verifyOwnerSessionToken(token) {
  try {
    const [encoded, supplied] = String(token || "").split(".");
    if (!verifySignature(encoded, supplied)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (
      payload.kind !== "centry-owner-session" ||
      typeof payload.owner !== "string" ||
      !isAddress(payload.owner) ||
      !Number.isFinite(Number(payload.exp)) ||
      Number(payload.exp) < Math.floor(Date.now() / 1000)
    ) return null;
    return { ...payload, owner: getAddress(payload.owner) };
  } catch {
    return null;
  }
}

function cookieValue(request) {
  const header = request.headers.get("cookie") || "";
  for (const item of header.split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name === OWNER_SESSION_COOKIE) return parts.join("=");
  }
  return "";
}

export function readOwnerSession(request) {
  return verifyOwnerSessionToken(cookieValue(request));
}

export function ownerSessionCookie(token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${OWNER_SESSION_COOKIE}=${token}; Path=/; Max-Age=${OWNER_SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearOwnerSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${OWNER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export async function verifyOwnerSession({ request, rpcUrl, account }) {
  const session = readOwnerSession(request);
  if (!session) throw new Error("owner_session_required");

  const normalizedAccount = getAddress(account);
  const provider = new JsonRpcProvider(resolveAgentRpcUrl(rpcUrl));
  const contract = new Contract(normalizedAccount, ACCOUNT_ABI, provider);
  const [onchainOwner, active] = await Promise.all([contract.owner(), contract.active()]);
  if (getAddress(onchainOwner).toLowerCase() !== session.owner.toLowerCase()) {
    throw new Error("account_owner_mismatch");
  }

  return { session, active: Boolean(active) };
}
