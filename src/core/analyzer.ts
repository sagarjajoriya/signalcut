import type { LLMProvider } from "../providers/types.js";
import type { ExtractedDoc } from "./extractor.js";
import { AnalysisSchema, type Analysis } from "./schema.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { SignalCutError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface AnalyzeOptions {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  temperature?: number;
}

/**
 * Turn extracted documentation into a validated, structured Analysis by asking
 * the configured provider for strict JSON and validating it against the schema.
 */
export async function analyzeDocument(
  doc: ExtractedDoc,
  options: AnalyzeOptions,
): Promise<Analysis> {
  logger.step(`Analyzing with ${options.provider.info.label} (${options.model})`);

  const raw = await options.provider.complete({
    apiKey: options.apiKey,
    model: options.model,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(doc),
    json: true,
    temperature: options.temperature ?? 0.1,
    maxOutputTokens: 4096,
  });

  const parsed = parseJson(raw);
  const result = AnalysisSchema.safeParse(parsed);
  if (!result.success) {
    logger.debug(`Schema validation failed: ${result.error.message}`);
    throw new SignalCutError("The model returned data in an unexpected shape.", {
      hint: "Try again, or use a more capable model with \"signalcut config model <provider> <model>\".",
    });
  }
  return result.data;
}

/** Parse model output as JSON, tolerating stray code fences or leading prose. */
function parseJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some models wrap JSON in ```json fences or add a sentence before it.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new SignalCutError("The model did not return valid JSON.", {
      hint: "Retry the command. If it persists, the model may be too small for structured output.",
    });
  }
}
