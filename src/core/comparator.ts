import type { LLMProvider } from "../providers/types.js";
import { getNpmPackage, getWeeklyDownloads } from "../npm/client.js";
import { GithubClient, parseRepoRef, type RepoRef } from "../github/client.js";
import {
  ComparisonSchema,
  COMPARE_PIPELINE_VERSION,
  type Comparison,
} from "./compare-schema.js";
import { COMPARE_SYSTEM_PROMPT, buildComparePrompt } from "./compare-prompt.js";
import {
  buildCacheKey,
  hashContent,
  readCacheEntry,
  writeCacheEntry,
} from "../storage/cache.js";
import { extractJsonObject } from "../utils/json.js";
import { SignalCutError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

/** A normalized, factual data pack for one library, from npm and/or GitHub. */
export interface LibraryData {
  input: string;
  name: string;
  source: "npm" | "github";
  description?: string;
  language?: string;
  version?: string;
  license?: string;
  dependencies?: number;
  installSize?: number; // bytes (npm unpacked size)
  weeklyDownloads?: number;
  stars?: number;
  openIssues?: number;
  lastActivity?: string; // ISO date of last publish or push
  archived?: boolean;
  /** Deterministic maintenance verdict derived from activity + archived. */
  maintenance: string;
}

export interface CompareResult {
  a: LibraryData;
  b: LibraryData;
  comparison: Comparison;
}

export interface CompareRunOptions {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  useCache: boolean;
  refresh: boolean;
}

export async function compareLibraries(
  inputA: string,
  inputB: string,
  options: CompareRunOptions,
): Promise<CompareResult> {
  logger.step(`Gathering data for ${inputA} and ${inputB}`);
  const [a, b] = await Promise.all([
    gatherLibrary(inputA),
    gatherLibrary(inputB),
  ]);

  const prompt = buildComparePrompt(a, b);
  const cacheKey = buildCacheKey({
    kind: "compare",
    a: a.name,
    b: b.name,
    provider: options.provider.info.id,
    model: options.model,
    pipeline: COMPARE_PIPELINE_VERSION,
    content: hashContent(prompt),
  });

  if (options.useCache && !options.refresh) {
    const cached = readCacheEntry<Comparison>(cacheKey);
    if (cached) {
      logger.step("Using cached comparison");
      return { a, b, comparison: cached };
    }
  }

  logger.step(`Comparing with ${options.provider.info.label} (${options.model})`);
  const raw = await options.provider.complete({
    apiKey: options.apiKey,
    model: options.model,
    system: COMPARE_SYSTEM_PROMPT,
    user: prompt,
    json: true,
    temperature: 0.1,
    maxOutputTokens: 2048,
  });

  const parsed = ComparisonSchema.safeParse(extractJsonObject(raw));
  if (!parsed.success) {
    logger.debug(`Schema validation failed: ${parsed.error.message}`);
    throw new SignalCutError("The model returned a comparison in an unexpected shape.", {
      hint: 'Try again, or use a more capable model with "signalcut config model <provider> <model>".',
    });
  }

  if (options.useCache) {
    writeCacheEntry(cacheKey, parsed.data, { a: a.name, b: b.name });
  }
  return { a, b, comparison: parsed.data };
}

/**
 * Resolve one library identifier into a factual data pack. A github.com URL or
 * an `owner/repo` (non-scoped) is treated as a GitHub project; anything else is
 * treated as an npm package (and enriched with GitHub stats when the package
 * declares a GitHub repository).
 */
async function gatherLibrary(input: string): Promise<LibraryData> {
  const trimmed = input.trim();

  if (looksLikeGithubRef(trimmed)) {
    return gatherFromGithub(trimmed, parseRepoRef(trimmed));
  }
  return gatherFromNpm(trimmed);
}

function looksLikeGithubRef(input: string): boolean {
  if (/github\.com/i.test(input)) return true;
  // owner/repo, but not a scoped npm package (@scope/name)
  return !input.startsWith("@") && input.split("/").length === 2;
}

async function gatherFromNpm(input: string): Promise<LibraryData> {
  const [pkg, weeklyDownloads] = await Promise.all([
    getNpmPackage(input),
    getWeeklyDownloads(input),
  ]);

  const data: LibraryData = {
    input,
    name: pkg.name,
    source: "npm",
    description: pkg.description ?? undefined,
    version: pkg.version,
    license: pkg.license ?? undefined,
    dependencies: pkg.dependencies.length,
    installSize: pkg.unpackedSize ?? undefined,
    weeklyDownloads,
    lastActivity: pkg.lastPublish ?? undefined,
    maintenance: "unknown",
  };

  // Enrich with GitHub stats when the package points at a GitHub repo.
  if (pkg.repoRef) {
    try {
      const meta = await new GithubClient().getRepo(pkg.repoRef);
      data.language = meta.language ?? undefined;
      data.stars = meta.stars;
      data.openIssues = meta.openIssues;
      data.archived = meta.archived;
      // Prefer the more recent of publish vs push as "last activity".
      data.lastActivity = mostRecent(data.lastActivity, meta.pushedAt);
    } catch (error) {
      logger.debug(`GitHub enrichment skipped for ${input}: ${String(error)}`);
    }
  }

  data.maintenance = deriveMaintenance(data);
  return data;
}

async function gatherFromGithub(input: string, ref: RepoRef): Promise<LibraryData> {
  const meta = await new GithubClient().getRepo(ref);
  const data: LibraryData = {
    input,
    name: meta.fullName,
    source: "github",
    description: meta.description ?? undefined,
    language: meta.language ?? undefined,
    license: meta.license ?? undefined,
    stars: meta.stars,
    openIssues: meta.openIssues,
    lastActivity: meta.pushedAt ?? undefined,
    archived: meta.archived,
    maintenance: "unknown",
  };
  data.maintenance = deriveMaintenance(data);
  return data;
}

/** Deterministic maintenance verdict from archived flag + last-activity age. */
function deriveMaintenance(data: LibraryData): string {
  if (data.archived) return "archived";
  if (!data.lastActivity) return "unknown";
  const ageDays = (Date.now() - new Date(data.lastActivity).getTime()) / 86_400_000;
  if (Number.isNaN(ageDays)) return "unknown";
  if (ageDays < 90) return "active";
  if (ageDays < 365) return "moderate";
  if (ageDays < 730) return "slow";
  return "stale";
}

function mostRecent(a: string | undefined, b: string | null): string | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}
