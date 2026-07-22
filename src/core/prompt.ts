import { ANALYSIS_JSON_SHAPE } from "./schema.js";
import type { ExtractedDoc } from "./extractor.js";

/**
 * The analyzer's job is extraction, not generation. The system prompt is
 * deliberately strict: no marketing, no invention, JSON only. If a fact is not
 * present in the source, the model must leave the field empty rather than guess.
 */
export const SYSTEM_PROMPT = `You are SignalCut, a documentation extraction engine for professional software engineers.

Your task: read the provided documentation text and extract ONLY concrete engineering facts.

Hard rules:
- Output MUST be a single valid JSON object. No prose, no markdown fences, no commentary.
- Extract, do not invent. If the source does not state something, use an empty string or empty array — never guess.
- Strip ALL marketing language, taglines, testimonials, and filler. Keep only technical substance.
- Preserve exact command syntax, code, parameter names, and error codes verbatim from the source.
- Be terse. Descriptions are one line. No adjectives that don't carry information.
- Do not include information that is not derivable from the provided text.

Return JSON matching exactly this shape (types shown, comments are for you only):
${ANALYSIS_JSON_SHAPE}`;

export function buildUserPrompt(doc: ExtractedDoc): string {
  return [
    `Source URL: ${doc.url}`,
    `Source title: ${doc.title}`,
    "",
    "Documentation content follows between the markers. Extract from this text only.",
    "----- BEGIN DOCUMENT -----",
    doc.markdown,
    "----- END DOCUMENT -----",
    "",
    "Return the JSON object now.",
  ].join("\n");
}
