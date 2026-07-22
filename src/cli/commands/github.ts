import { Command } from "commander";
import { analyzeRepository } from "../../github/insights.js";
import { resolveRun } from "../resolve.js";
import { renderGithubInsights } from "../render-github.js";
import { logger } from "../../utils/logger.js";

interface GithubOptions {
  provider?: string;
  model?: string;
  json?: boolean;
  cache?: boolean; // commander sets false for --no-cache
  refresh?: boolean;
}

export function buildGithubCommand(): Command {
  return new Command("github")
    .argument("<repo>", "repository as owner/repo or a github.com URL")
    .description("Extract engineering insights from a GitHub repository")
    .option("-p, --provider <id>", "override the active provider")
    .option("-m, --model <model>", "override the configured model")
    .option("--json", "output raw JSON instead of the formatted report")
    .option("--no-cache", "skip the cache for this run (do not read or write)")
    .option("--refresh", "ignore any cached result and overwrite it")
    .action(async (repo: string, options: GithubOptions) => {
      const { provider, apiKey, model } = resolveRun({
        provider: options.provider,
        model: options.model,
      });

      const { meta, insights } = await analyzeRepository(repo, {
        provider,
        apiKey,
        model,
        useCache: options.cache !== false,
        refresh: Boolean(options.refresh),
      });

      if (options.json) {
        logger.output(JSON.stringify({ repo: meta.fullName, meta, insights }, null, 2));
        return;
      }
      logger.output(renderGithubInsights(meta, insights));
    });
}
