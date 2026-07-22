import { Command } from "commander";
import { compareLibraries } from "../../core/comparator.js";
import { resolveRun } from "../resolve.js";
import { renderComparison } from "../render-compare.js";
import { logger } from "../../utils/logger.js";

interface CompareOptions {
  provider?: string;
  model?: string;
  json?: boolean;
  cache?: boolean; // commander sets false for --no-cache
  refresh?: boolean;
}

export function buildCompareCommand(): Command {
  return new Command("compare")
    .argument("<libraryA>", "first library (npm name, owner/repo, or URL)")
    .argument("<libraryB>", "second library (npm name, owner/repo, or URL)")
    .description("Compare two libraries across engineering dimensions")
    .option("-p, --provider <id>", "override the active provider")
    .option("-m, --model <model>", "override the configured model")
    .option("--json", "output raw JSON instead of the formatted table")
    .option("--no-cache", "skip the cache for this run (do not read or write)")
    .option("--refresh", "ignore any cached result and overwrite it")
    .action(async (libraryA: string, libraryB: string, options: CompareOptions) => {
      const { provider, apiKey, model } = resolveRun({
        provider: options.provider,
        model: options.model,
      });

      const result = await compareLibraries(libraryA, libraryB, {
        provider,
        apiKey,
        model,
        useCache: options.cache !== false,
        refresh: Boolean(options.refresh),
      });

      if (options.json) {
        logger.output(JSON.stringify(result, null, 2));
        return;
      }
      logger.output(renderComparison(result));
    });
}
