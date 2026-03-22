// Node.js re-implementation of production crypto.js (AES-256-GCM).
// Used for server-side test helpers that need to encrypt/decrypt messages
// outside the browser context (e.g., direct WebSocket testing).
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

const ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

export async function encrypt(text: string, password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Match Web Crypto format: salt + iv + ciphertext + tag
  const combined = Buffer.concat([salt, iv, encrypted, tag]);
  return combined.toString('base64');
}

export async function decrypt(encryptedData: string, password: string): Promise<string> {
  const combined = Buffer.from(encryptedData, 'base64');
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const encryptedWithTag = combined.subarray(SALT_LENGTH + IV_LENGTH);
  const tag = encryptedWithTag.subarray(encryptedWithTag.length - TAG_LENGTH);
  const encrypted = encryptedWithTag.subarray(0, encryptedWithTag.length - TAG_LENGTH);
  const key = deriveKey(password, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}
