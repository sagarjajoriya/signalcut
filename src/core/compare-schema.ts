import { z } from "zod";

/**
 * The LLM's contribution to a comparison: only the qualitative dimensions that
 * are NOT available as hard registry/GitHub data. Everything factual (versions,
 * sizes, downloads, dates) is filled deterministically by the comparator, so the
 * model can't get those wrong. Fields are keyed "a"/"b" for the two libraries.
 */

const PairString = z.object({ a: z.string(), b: z.string() });
const PairList = z.object({
  a: z.array(z.string()).default([]),
  b: z.array(z.string()).default([]),
});

export const ComparisonSchema = z.object({
  performance: PairString,
  limitations: PairList,
  bestFor: PairString,
  summary: z.string(),
});

export type Comparison = z.infer<typeof ComparisonSchema>;

/** Bumped when the compare schema/prompt changes; mixed into cache keys. */
export const COMPARE_PIPELINE_VERSION = 1;

export const COMPARE_JSON_SHAPE = `{
  "performance": { "a": string, "b": string },   // concrete perf characteristics per library; "" if unknown
  "limitations": { "a": string[], "b": string[] }, // known limitations/caveats per library
  "bestFor": { "a": string, "b": string },        // the scenario each library is the better choice for
  "summary": string                                // 1-2 sentences: how to choose between them
}`;
