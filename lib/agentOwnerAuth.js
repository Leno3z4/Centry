import { JsonRpcProvider, Contract, getAddress, isAddress, verifyMessage } from "ethers";
import crypto from "node:crypto";

const ACCOUNT_ABI = [
  "function owner() view returns (address)",
  "function active() view returns (bool)",
];

const DEFAULT_AGENT_RPC_URL = "https://rpc.mainnet.arc.io";

function secret() {
  return process.env.CENTRY_AGENT_CONNECTION_SECRET || "";
}

function agentRpcUrl() {
  const configured = process.env.CENTRY_AGENT_RPC_URL || process.env.CENTRY_ERC8004_RPC_URL || "";
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

export function issueOwnerChallenge({ owner, account, action }) {
  if (!secret()) throw new Error("agent_connection_secret_not_configured");
  const normalizedOwner = getAddress(owner);
  const normalizedAccount = getAddress(account);
  const nonce = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 300;
  const payload = { kind: "centry-owner-admin", nonce, owner: normalizedOwner, account: normalizedAccount, action, exp };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${sign(encoded)}`;
  const message = [
    "Centry agent administration",
    "",
    `Action: ${action}`,
    `Account: ${normalizedAccount}`,
    `Owner: ${normalizedOwner}`,
    `Nonce: ${nonce}`,
    `Expires: ${exp}`,
    "",
    "I authorize this Centry agent administration action for this account.",
  ].join("\n");
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

export async function verifyOwnerAuthorization({ rpcUrl, challengeToken, signature, owner, account, action }) {
  const challenge = verifyOwnerChallenge(challengeToken);
  if (!challenge || challenge.owner.toLowerCase() !== owner.toLowerCase() || challenge.account.toLowerCase() !== account.toLowerCase() || challenge.action !== action) throw new Error("invalid_owner_challenge");

  const message = [
    "Centry agent administration",
    "",
    `Action: ${action}`,
    `Account: ${challenge.account}`,
    `Owner: ${challenge.owner}`,
    `Nonce: ${challenge.nonce}`,
    `Expires: ${challenge.exp}`,
    "",
    "I authorize this Centry agent administration action for this account.",
  ].join("\n");

  const signer = getAddress(verifyMessage(message, signature));
  if (signer.toLowerCase() !== challenge.owner.toLowerCase()) throw new Error("owner_signature_mismatch");

  const provider = new JsonRpcProvider(rpcUrl || agentRpcUrl());
  const contract = new Contract(challenge.account, ACCOUNT_ABI, provider);
  const [onchainOwner, active] = await Promise.all([contract.owner(), contract.active()]);
  if (getAddress(onchainOwner).toLowerCase() !== signer.toLowerCase()) throw new Error("account_owner_mismatch");

  return { challenge, active: Boolean(active) };
}
