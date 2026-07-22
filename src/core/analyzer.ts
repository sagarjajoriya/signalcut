import type { LLMProvider } from "../providers/types.js";
import type { ExtractedDoc } from "./extractor.js";
import { AnalysisSchema, type Analysis } from "./schema.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { SignalCutError } from "../utils/errors.js";
import { extractJsonObject } from "../utils/json.js";
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

  const parsed = extractJsonObject(raw);
  const result = AnalysisSchema.safeParse(parsed);
  if (!result.success) {
    logger.debug(`Schema validation failed: ${result.error.message}`);
    throw new SignalCutError("The model returned data in an unexpected shape.", {
      hint: "Try again, or use a more capable model with \"signalcut config model <provider> <model>\".",
    });
  }
  return result.data;
}
