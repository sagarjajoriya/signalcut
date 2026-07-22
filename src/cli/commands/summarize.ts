import { Command } from "commander";
import { extractFromUrl } from "../../core/extractor.js";
import { analyzeDocument } from "../../core/analyzer.js";
import { PIPELINE_VERSION, type Analysis } from "../../core/schema.js";
import { resolveRun } from "../resolve.js";
import { renderAnalysis } from "../render.js";
import {
  buildCacheKey,
  hashContent,
  readCacheEntry,
  writeCacheEntry,
} from "../../storage/cache.js";
import { logger } from "../../utils/logger.js";
import { SignalCutError } from "../../utils/errors.js";

interface SummarizeOptions {
  provider?: string;
  model?: string;
  json?: boolean;
  maxChars?: string;
  cache?: boolean; // commander sets false for --no-cache
  refresh?: boolean;
}

export function buildSummarizeCommand(): Command {
  return new Command("summarize")
    .argument("<url>", "URL of the documentation page to analyze")
    .description("Extract noise-free engineering facts from a documentation URL")
    .option("-p, --provider <id>", "override the active provider")
    .option("-m, --model <model>", "override the configured model")
    .option("--json", "output raw JSON instead of the formatted report")
    .option("--max-chars <n>", "max characters of content sent to the model")
    .option("--no-cache", "skip the cache for this run (do not read or write)")
    .option("--refresh", "ignore any cached result and overwrite it")
    .action(async (url: string, options: SummarizeOptions) => {
      const { provider, apiKey, model } = resolveRun({
        provider: options.provider,
        model: options.model,
      });

      const maxChars = parseMaxChars(options.maxChars);
      const doc = await extractFromUrl(url, maxChars ? { maxChars } : {});
      if (doc.truncated) {
        logger.debug(
          `Content truncated from ${doc.originalLength} chars to fit the budget.`,
        );
      }

      const useCache = options.cache !== false; // --no-cache => false
      const cacheKey = buildCacheKey({
        url: doc.url,
        provider: provider.info.id,
        model,
        pipeline: PIPELINE_VERSION,
        content: hashContent(doc.markdown),
      });

      let analysis: Analysis | undefined;
      if (useCache && !options.refresh) {
        analysis = readCacheEntry<Analysis>(cacheKey);
        if (analysis) logger.step("Using cached analysis");
      }

      if (!analysis) {
        analysis = await analyzeDocument(doc, { provider, apiKey, model });
        if (useCache) {
          writeCacheEntry(cacheKey, analysis, {
            url: doc.url,
            provider: provider.info.id,
            model,
          });
        }
      }

      if (options.json) {
        logger.output(JSON.stringify(analysis, null, 2));
        return;
      }
      logger.output(renderAnalysis(analysis, { url: doc.url }));
    });
}

function parseMaxChars(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new SignalCutError(`--max-chars must be a positive integer, got "${value}".`);
  }
  return n;
}
