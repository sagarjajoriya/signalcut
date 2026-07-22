import type { LLMProvider } from "../providers/types.js";
import { GithubClient, parseRepoRef, type RepoMeta } from "./client.js";
import {
  GithubInsightsSchema,
  GITHUB_PIPELINE_VERSION,
  type GithubInsights,
} from "./schema.js";
import {
  GITHUB_SYSTEM_PROMPT,
  buildGithubUserPrompt,
  type GithubCorpus,
} from "./prompt.js";
import {
  buildCacheKey,
  hashContent,
  readCacheEntry,
  writeCacheEntry,
} from "../storage/cache.js";
import { extractJsonObject } from "../utils/json.js";
import { SignalCutError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface GithubRunOptions {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  useCache: boolean;
  refresh: boolean;
}

export interface GithubResult {
  meta: RepoMeta;
  insights: GithubInsights;
}

/**
 * Gather a repository's public signals, then distill them into structured
 * insights via the configured provider. Results are cached like docs analyses.
 */
export async function analyzeRepository(
  repoRef: string,
  options: GithubRunOptions,
): Promise<GithubResult> {
  const ref = parseRepoRef(repoRef);
  const client = new GithubClient();

  logger.step(`Fetching ${ref.owner}/${ref.repo} metadata`);
  const meta = await client.getRepo(ref);

  logger.step("Fetching README, releases, and top issues");
  const [readme, releases, issues] = await Promise.all([
    client.getReadme(ref),
    client.getReleases(ref),
    client.getTopIssues(ref),
  ]);

  const corpus: GithubCorpus = { meta, readme, releases, issues };
  const userPrompt = buildGithubUserPrompt(corpus);

  const cacheKey = buildCacheKey({
    kind: "github",
    repo: meta.fullName,
    provider: options.provider.info.id,
    model: options.model,
    pipeline: GITHUB_PIPELINE_VERSION,
    content: hashContent(userPrompt),
  });

  if (options.useCache && !options.refresh) {
    const cached = readCacheEntry<GithubInsights>(cacheKey);
    if (cached) {
      logger.step("Using cached insights");
      return { meta, insights: cached };
    }
  }

  logger.step(
    `Analyzing with ${options.provider.info.label} (${options.model})`,
  );
  const raw = await options.provider.complete({
    apiKey: options.apiKey,
    model: options.model,
    system: GITHUB_SYSTEM_PROMPT,
    user: userPrompt,
    json: true,
    temperature: 0.1,
    maxOutputTokens: 4096,
  });

  const result = GithubInsightsSchema.safeParse(extractJsonObject(raw));
  if (!result.success) {
    logger.debug(`Schema validation failed: ${result.error.message}`);
    throw new SignalCutError("The model returned insights in an unexpected shape.", {
      hint: 'Try again, or use a more capable model with "signalcut config model <provider> <model>".',
    });
  }

  if (options.useCache) {
    writeCacheEntry(cacheKey, result.data, { repo: meta.fullName });
  }
  return { meta, insights: result.data };
}
