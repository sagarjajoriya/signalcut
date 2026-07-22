import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { cacheDir } from "./paths.js";
import { logger } from "../utils/logger.js";

/**
 * A small content-addressed cache for analysis results. Entries are plain JSON
 * files named by a hash of everything that affects the output (URL, provider,
 * model, pipeline version, and the extracted content). Nothing secret is stored
 * here — only the public page's derived analysis.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEnvelope<T> {
  createdAt: number; // epoch ms
  key: string;
  meta: Record<string, string>;
  data: T;
}

/** Build a stable cache key from the parts that determine the result. */
export function buildCacheKey(parts: Record<string, string | number>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((k) => `${k}=${parts[k]}`)
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/** Hash arbitrary text (e.g. extracted markdown) into a short digest. */
export function hashContent(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function entryPath(key: string): string {
  return path.join(cacheDir(), `${key}.json`);
}

export function readCacheEntry<T>(
  key: string,
  ttlMs: number = DEFAULT_TTL_MS,
): T | undefined {
  const file = entryPath(key);
  if (!existsSync(file)) return undefined;

  try {
    const envelope = JSON.parse(readFileSync(file, "utf8")) as CacheEnvelope<T>;
    const age = Date.now() - envelope.createdAt;
    if (age > ttlMs) {
      logger.debug(`Cache entry expired (${Math.round(age / 1000)}s old).`);
      return undefined;
    }
    logger.debug(`Cache hit for ${key} (${Math.round(age / 1000)}s old).`);
    return envelope.data;
  } catch {
    // Corrupt entry — treat as a miss and let it be overwritten.
    return undefined;
  }
}

export function writeCacheEntry<T>(
  key: string,
  data: T,
  meta: Record<string, string> = {},
): void {
  mkdirSync(cacheDir(), { recursive: true, mode: 0o700 });
  const envelope: CacheEnvelope<T> = {
    createdAt: Date.now(),
    key,
    meta,
    data,
  };
  writeFileSync(entryPath(key), JSON.stringify(envelope), { mode: 0o600 });
}

/** Remove all cache entries. Returns the number of files deleted. */
export function clearCache(): number {
  const dir = cacheDir();
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".json")) {
      rmSync(path.join(dir, name), { force: true });
      count += 1;
    }
  }
  return count;
}

/** Summarize the cache for `cache status`: entry count and total size. */
export function cacheStats(): { entries: number; bytes: number; dir: string } {
  const dir = cacheDir();
  if (!existsSync(dir)) return { entries: 0, bytes: 0, dir };
  let entries = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    entries += 1;
    bytes += statSync(path.join(dir, name)).size;
  }
  return { entries, bytes, dir };
}
