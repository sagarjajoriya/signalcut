import { SignalCutError } from "../utils/errors.js";
import { parseRepoRef, type RepoRef } from "../github/client.js";

const REGISTRY_ROOT = "https://registry.npmjs.org";
const DOWNLOADS_ROOT = "https://api.npmjs.org/downloads/point/last-week";
const REQUEST_TIMEOUT_MS = 15_000;

export interface NpmPackage {
  name: string;
  version: string;
  description: string | null;
  license: string | null;
  homepage: string | null;
  /** Names of runtime dependencies. */
  dependencies: string[];
  /** Unpacked install size in bytes, when the registry reports it. */
  unpackedSize: number | null;
  /** ISO timestamp the latest version was published. */
  lastPublish: string | null;
  /** GitHub repo parsed from the package's `repository` field, if resolvable. */
  repoRef: RepoRef | null;
}

/** Fetch registry metadata for a package's latest published version. */
export async function getNpmPackage(name: string): Promise<NpmPackage> {
  const data = await request<NpmRegistryResponse>(
    `${REGISTRY_ROOT}/${encodePackageName(name)}`,
    name,
  );

  const latest = data["dist-tags"]?.latest;
  if (!latest || !data.versions?.[latest]) {
    throw new SignalCutError(`Could not resolve a latest version for "${name}".`);
  }
  const version = data.versions[latest];

  return {
    name: data.name ?? name,
    version: latest,
    description: version.description ?? data.description ?? null,
    license: normalizeLicense(version.license ?? data.license),
    homepage: version.homepage ?? data.homepage ?? null,
    dependencies: Object.keys(version.dependencies ?? {}),
    unpackedSize: version.dist?.unpackedSize ?? null,
    lastPublish: data.time?.[latest] ?? null,
    repoRef: resolveRepoRef(version.repository ?? data.repository),
  };
}

/** Weekly download count from the npm downloads API (0 if unavailable). */
export async function getWeeklyDownloads(name: string): Promise<number> {
  try {
    const data = await request<{ downloads?: number }>(
      `${DOWNLOADS_ROOT}/${encodePackageName(name)}`,
      name,
    );
    return data.downloads ?? 0;
  } catch {
    // Downloads are a nice-to-have; never fail the whole comparison over them.
    return 0;
  }
}

async function request<T>(url: string, name: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "SignalCut/0.1" },
    });
    if (response.status === 404) {
      throw new SignalCutError(`npm package "${name}" not found.`, {
        hint: "Check the spelling, or pass a GitHub repo as owner/repo instead.",
      });
    }
    if (!response.ok) {
      throw new SignalCutError(
        `npm registry request failed (HTTP ${response.status}) for "${name}".`,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof SignalCutError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SignalCutError(`Timed out querying npm for "${name}".`);
    }
    throw new SignalCutError(`Network error querying npm for "${name}".`, {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Scoped packages (@scope/name) must keep the "@" but escape the slash. */
function encodePackageName(name: string): string {
  if (name.startsWith("@")) {
    return name.replace("/", "%2f");
  }
  return encodeURIComponent(name);
}

function normalizeLicense(
  license: string | { type?: string } | undefined | null,
): string | null {
  if (!license) return null;
  if (typeof license === "string") return license;
  return license.type ?? null;
}

function resolveRepoRef(
  repository: string | { url?: string } | undefined | null,
): RepoRef | null {
  if (!repository) return null;
  const url = typeof repository === "string" ? repository : repository.url;
  if (!url || !/github\.com/i.test(url)) return null;
  try {
    return parseRepoRef(url);
  } catch {
    return null;
  }
}

interface NpmVersionResponse {
  description?: string;
  license?: string | { type?: string };
  homepage?: string;
  dependencies?: Record<string, string>;
  dist?: { unpackedSize?: number };
  repository?: string | { url?: string };
}

interface NpmRegistryResponse {
  name?: string;
  description?: string;
  license?: string | { type?: string };
  homepage?: string;
  repository?: string | { url?: string };
  "dist-tags"?: { latest?: string };
  versions?: Record<string, NpmVersionResponse>;
  time?: Record<string, string>;
}
