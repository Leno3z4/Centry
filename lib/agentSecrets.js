import crypto from "node:crypto";

function encryptionKey() {
  const raw = process.env.CENTRY_AGENT_ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("agent_encryption_key_not_configured");
  return Buffer.from(raw, "hex");
}

export function encryptSecret(plaintext) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(payload) {
  const key = encryptionKey();
  const [ivRaw, tagRaw, ciphertextRaw] = String(payload).split(".");
  if (!ivRaw || !tagRaw || !ciphertextRaw) throw new Error("invalid_encrypted_secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function hashApiKey(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}

export function generateApiKey() {
  return `ck_live_${crypto.randomBytes(24).toString("base64url")}`;
}
