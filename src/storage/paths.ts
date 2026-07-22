import os from "node:os";
import path from "node:path";
import { mkdirSync } from "node:fs";

/**
 * All SignalCut state lives in a single directory the user owns. The location
 * can be overridden with SIGNALCUT_HOME (useful for tests and CI). On disk we
 * keep:
 *   config.json       – non-secret settings (active provider, model choices)
 *   credentials.enc   – AES-256-GCM encrypted API keys
 *   master.key        – 32-byte encryption key (0600), never leaves the machine
 *   cache/            – reserved for Phase 2 response caching
 */
export function homeDir(): string {
  const override = process.env.SIGNALCUT_HOME;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".signalcut");
}

export function configFile(): string {
  return path.join(homeDir(), "config.json");
}

export function credentialsFile(): string {
  return path.join(homeDir(), "credentials.enc");
}

export function masterKeyFile(): string {
  return path.join(homeDir(), "master.key");
}

export function privacyAckFile(): string {
  return path.join(homeDir(), ".privacy-ack");
}

export function cacheDir(): string {
  return path.join(homeDir(), "cache");
}

/** Ensure the home directory exists with owner-only permissions. */
export function ensureHomeDir(): string {
  const dir = homeDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
