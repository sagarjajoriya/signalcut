import { z } from "zod";

/**
 * Structured insights extracted from a GitHub repository. Same philosophy as the
 * docs analysis: concrete facts only, empty rather than guessed, no marketing.
 */

const ProblemSchema = z.object({
  problem: z.string(),
  workaround: z.string().optional(),
  /** Issue numbers this relates to, e.g. ["#123"]. */
  issues: z.array(z.string()).default([]),
});

export const GithubInsightsSchema = z.object({
  summary: z.string(),
  installation: z.array(z.string()).default([]),
  usage: z.array(z.string()).default([]),
  breakingChanges: z.array(z.string()).default([]),
  commonProblems: z.array(ProblemSchema).default([]),
  knownWorkarounds: z.array(z.string()).default([]),
  maintenanceStatus: z.string().optional(),
});

export type GithubInsights = z.infer<typeof GithubInsightsSchema>;

/** Bumped when the github schema/prompt changes; mixed into cache keys. */
export const GITHUB_PIPELINE_VERSION = 1;

export const GITHUB_JSON_SHAPE = `{
  "summary": string,                     // what the project is and does, technical, 1-3 sentences
  "installation": string[],              // exact install/setup commands from the README
  "usage": string[],                     // minimal usage steps or snippets from the README
  "breakingChanges": string[],           // breaking changes / migration notes from release notes
  "commonProblems": [
    {
      "problem": string,                 // a recurring issue users hit
      "workaround": string,              // stated fix or mitigation, if any
      "issues": string[]                 // related issue refs, e.g. ["#123"]
    }
  ],
  "knownWorkarounds": string[],          // general workarounds mentioned across issues
  "maintenanceStatus": string            // e.g. "active", "slow", "archived" + a short factual reason
}`;
