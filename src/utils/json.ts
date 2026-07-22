import { SignalCutError } from "./errors.js";

/**
 * Parse model output as a JSON object, tolerating stray code fences or a
 * sentence of prose before/after the object that smaller models sometimes emit.
 */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
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
