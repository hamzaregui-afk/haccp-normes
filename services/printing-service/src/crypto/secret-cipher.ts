import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Symmetric envelope encryption for secrets stored at rest (per-tenant PrintNode
 * API keys). AES-256-GCM (authenticated) with a per-record random salt + IV.
 *
 * Stored token = base64([16B salt][12B iv][16B auth tag][ciphertext]).
 * The 32-byte key is derived from ENCRYPTION_KEY via scrypt with the record's
 * salt, so encrypting the same plaintext twice yields different tokens and a
 * leaked ciphertext cannot be reversed without ENCRYPTION_KEY.
 *
 * ARCH-DECISION: ENCRYPTION_KEY is read from process.env directly here (it is
 * also declared + length-validated in config/env.ts, which runs at boot). This
 * avoids importing the env proxy — whose validation calls process.exit(1) on any
 * missing var — into a leaf util, which would make unit tests impossible without
 * a fully-populated env. The value is still validated (length ≥ 32) at point of
 * use. This is the one intentional exception to the "no process.env outside
 * env.ts" rule, justified by testability + the secret being optional.
 */

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super('ENCRYPTION_KEY is not configured — encrypted secret storage is disabled');
    this.name = 'EncryptionNotConfiguredError';
  }
}

/** True when ENCRYPTION_KEY is present and long enough to use. */
export function isEncryptionConfigured(): boolean {
  const key = process.env['ENCRYPTION_KEY'];
  return typeof key === 'string' && key.length >= 32;
}

function requireSecret(): string {
  const key = process.env['ENCRYPTION_KEY'];
  if (!key || key.length < 32) throw new EncryptionNotConfiguredError();
  return key;
}

/** Encrypt a UTF-8 secret → base64 token. Throws EncryptionNotConfiguredError if disabled. */
export function encryptSecret(plaintext: string): string {
  const secret = requireSecret();
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = scryptSync(secret, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ciphertext]).toString('base64');
}

/** Decrypt a base64 token produced by encryptSecret back to the UTF-8 secret. */
export function decryptSecret(token: string): string {
  const secret = requireSecret();
  const raw = Buffer.from(token, 'base64');
  const salt = raw.subarray(0, SALT_LEN);
  const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = scryptSync(secret, salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
