import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { ensureHomeDir, masterKeyFile } from "./paths.js";
import { SignalCutError } from "../utils/errors.js";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const PAYLOAD_VERSION = 1;

interface EncryptedPayload {
  v: number;
  iv: string; // base64
  tag: string; // base64
  data: string; // base64
}

/**
 * The master key is generated once and stored locally with 0600 permissions.
 * It never leaves the machine. This gives us encryption-at-rest for API keys:
 * the credentials file is useless without this key file, and neither is ever
 * transmitted anywhere.
 *
 * Threat model: this protects against accidental exposure (backups, synced
 * dotfiles, shoulder-surfing a plaintext file) — not against an attacker who
 * already has full read access to the user's home directory. For that, a future
 * phase can back this with the OS keychain via the same interface.
 */
function getOrCreateMasterKey(): Buffer {
  ensureHomeDir();
  const keyPath = masterKeyFile();

  if (existsSync(keyPath)) {
    const key = readFileSync(keyPath);
    if (key.length !== KEY_BYTES) {
      throw new SignalCutError("Stored master key is corrupt.", {
        hint: `Delete ${keyPath} and re-add your API keys with "signalcut config set <provider>".`,
      });
    }
    return key;
  }

  const key = randomBytes(KEY_BYTES);
  // Write with restrictive permissions from the start, then enforce again.
  writeFileSync(keyPath, key, { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  return key;
}

export function encryptString(plaintext: string): string {
  const key = getOrCreateMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    v: PAYLOAD_VERSION,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
  return JSON.stringify(payload);
}

export function decryptString(serialized: string): string {
  const key = getOrCreateMasterKey();

  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(serialized) as EncryptedPayload;
  } catch (cause) {
    throw new SignalCutError("Credentials file is corrupt and cannot be read.", {
      hint: 'Run "signalcut config reset" to start over.',
      cause,
    });
  }

  try {
    const iv = Buffer.from(payload.iv, "base64");
    const tag = Buffer.from(payload.tag, "base64");
    const data = Buffer.from(payload.data, "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (cause) {
    throw new SignalCutError("Failed to decrypt credentials.", {
      hint:
        "The master key may have changed or the file was tampered with. " +
        'Run "signalcut config reset" and re-add your keys.',
      cause,
    });
  }
}
