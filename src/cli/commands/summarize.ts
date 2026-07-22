import { Command } from "commander";
import { extractFromUrl } from "../../core/extractor.js";
import { analyzeDocument } from "../../core/analyzer.js";
import { resolveRun } from "../resolve.js";
import { renderAnalysis } from "../render.js";
import { logger } from "../../utils/logger.js";
import { SignalCutError } from "../../utils/errors.js";

interface SummarizeOptions {
  provider?: string;
  model?: string;
  json?: boolean;
  maxChars?: string;
}

export function buildSummarizeCommand(): Command {
  return new Command("summarize")
    .argument("<url>", "URL of the documentation page to analyze")
    .description("Extract noise-free engineering facts from a documentation URL")
    .option("-p, --provider <id>", "override the active provider")
    .option("-m, --model <model>", "override the configured model")
    .option("--json", "output raw JSON instead of the formatted report")
    .option("--max-chars <n>", "max characters of content sent to the model")
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

      const analysis = await analyzeDocument(doc, { provider, apiKey, model });

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
