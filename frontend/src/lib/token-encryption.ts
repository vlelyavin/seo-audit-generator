/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 *
 * Requires TOKEN_ENCRYPTION_KEY env var — a 64-char hex string (32 bytes).
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Encrypted tokens are prefixed with "enc:" so plaintext tokens (pre-migration)
 * are transparently handled during the migration window.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const ENCRYPTED_PREFIX = "enc:";

function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) return null;
  if (keyHex.length !== 64) {
    console.error(
      "[token-encryption] TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)"
    );
    return null;
  }
  return Buffer.from(keyHex, "hex");
}

/** Encrypt a plaintext token. Returns prefixed ciphertext, or plaintext if no key configured. */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

/** Decrypt a token. Transparently returns plaintext tokens that lack the enc: prefix. */
export function decryptToken(value: string): string {
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;

  const key = getEncryptionKey();
  if (!key) {
    throw new Error("Cannot decrypt token: TOKEN_ENCRYPTION_KEY not configured");
  }

  const parts = value.slice(ENCRYPTED_PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const [ivHex, ciphertextHex, tagHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/** Whether encryption is configured. */
export function isEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}
