import {
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  chmodSync,
} from "node:fs";
import {
  ensureHomeDir,
  configFile,
  credentialsFile,
  privacyAckFile,
  homeDir,
} from "./paths.js";
import { encryptString, decryptString } from "./crypto.js";
import { SignalCutError } from "../utils/errors.js";

/** Non-secret configuration. Safe to store as plaintext JSON. */
export interface SignalCutConfig {
  activeProvider?: string;
  /** Per-provider overrides, e.g. a chosen model. Never contains secrets. */
  providers: Record<string, { model?: string }>;
}

const DEFAULT_CONFIG: SignalCutConfig = { providers: {} };

/** Encrypted map of secretId -> value. Stored only in ciphertext on disk. */
type CredentialMap = Record<string, string>;

/**
 * Namespaced key for non-provider secrets (e.g. a GitHub token) in the same
 * encrypted map. The underscore prefix keeps them from ever colliding with a
 * provider id.
 */
const GITHUB_TOKEN_ID = "_github_token";

// ---------------------------------------------------------------------------
// Config (non-secret)
// ---------------------------------------------------------------------------

export function readConfig(): SignalCutConfig {
  const file = configFile();
  if (!existsSync(file)) {
    return { ...DEFAULT_CONFIG, providers: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<SignalCutConfig>;
    return {
      activeProvider: parsed.activeProvider,
      providers: parsed.providers ?? {},
    };
  } catch (cause) {
    throw new SignalCutError("Config file is corrupt.", {
      hint: `Fix or delete ${file}.`,
      cause,
    });
  }
}

export function writeConfig(config: SignalCutConfig): void {
  ensureHomeDir();
  writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(configFile(), 0o600);
}

export function setActiveProvider(providerId: string): void {
  const config = readConfig();
  config.activeProvider = providerId;
  if (!config.providers[providerId]) {
    config.providers[providerId] = {};
  }
  writeConfig(config);
}

export function getActiveProvider(): string | undefined {
  return readConfig().activeProvider;
}

export function setProviderModel(providerId: string, model: string): void {
  const config = readConfig();
  const entry = config.providers[providerId] ?? {};
  entry.model = model;
  config.providers[providerId] = entry;
  writeConfig(config);
}

export function getProviderModel(providerId: string): string | undefined {
  return readConfig().providers[providerId]?.model;
}

// ---------------------------------------------------------------------------
// Credentials (secret, encrypted at rest)
// ---------------------------------------------------------------------------

function readCredentialMap(): CredentialMap {
  const file = credentialsFile();
  if (!existsSync(file)) {
    return {};
  }
  const decrypted = decryptString(readFileSync(file, "utf8"));
  return JSON.parse(decrypted) as CredentialMap;
}

function writeCredentialMap(map: CredentialMap): void {
  ensureHomeDir();
  const serialized = encryptString(JSON.stringify(map));
  writeFileSync(credentialsFile(), serialized, { mode: 0o600 });
  chmodSync(credentialsFile(), 0o600);
}

export function setKey(providerId: string, apiKey: string): void {
  const key = apiKey.trim();
  if (!key) {
    throw new SignalCutError("Refusing to store an empty API key.");
  }
  const map = readCredentialMap();
  map[providerId] = key;
  writeCredentialMap(map);
}

export function getStoredKey(providerId: string): string | undefined {
  const map = readCredentialMap();
  return map[providerId];
}

export function deleteKey(providerId: string): boolean {
  const map = readCredentialMap();
  if (!(providerId in map)) {
    return false;
  }
  delete map[providerId];
  writeCredentialMap(map);
  return true;
}

export function hasKey(providerId: string): boolean {
  return Boolean(readCredentialMap()[providerId]);
}

// ---------------------------------------------------------------------------
// GitHub token (optional, encrypted alongside provider keys)
// ---------------------------------------------------------------------------

export function setGithubToken(token: string): void {
  const value = token.trim();
  if (!value) {
    throw new SignalCutError("Refusing to store an empty GitHub token.");
  }
  const map = readCredentialMap();
  map[GITHUB_TOKEN_ID] = value;
  writeCredentialMap(map);
}

export function getGithubToken(): string | undefined {
  return readCredentialMap()[GITHUB_TOKEN_ID];
}

export function hasGithubToken(): boolean {
  return Boolean(readCredentialMap()[GITHUB_TOKEN_ID]);
}

export function deleteGithubToken(): boolean {
  const map = readCredentialMap();
  if (!(GITHUB_TOKEN_ID in map)) return false;
  delete map[GITHUB_TOKEN_ID];
  writeCredentialMap(map);
  return true;
}

// ---------------------------------------------------------------------------
// Privacy acknowledgement + reset
// ---------------------------------------------------------------------------

export function hasAcknowledgedPrivacy(): boolean {
  return existsSync(privacyAckFile());
}

export function acknowledgePrivacy(): void {
  ensureHomeDir();
  writeFileSync(privacyAckFile(), `${new Date().toISOString()}\n`, { mode: 0o600 });
}

/** Wipe all local SignalCut state: keys, master key, config. */
export function resetAll(): void {
  const dir = homeDir();
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
