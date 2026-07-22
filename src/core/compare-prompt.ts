import { COMPARE_JSON_SHAPE } from "./compare-schema.js";
import type { LibraryData } from "./comparator.js";

export const COMPARE_SYSTEM_PROMPT = `You are SignalCut, a technical comparison engine for professional software engineers.

You are given hard, factual data about two libraries (A and B): versions, sizes, downloads, dependencies, activity. Your job is to fill ONLY the qualitative dimensions that are not already in that data.

Hard rules:
- Output MUST be a single valid JSON object. No prose, no markdown fences, no commentary.
- Do NOT restate the numeric facts you were given (sizes, downloads, stars); those are handled elsewhere.
- performance: state concrete characteristics (algorithmic complexity, sync/async, streaming, benchmarks you are confident about). If unknown, use "".
- limitations: real, commonly-cited caveats for each library. Empty array if you are not confident.
- bestFor: the scenario where each library is the better pick.
- Be terse and neutral. No hype. Do not declare an overall "winner" beyond what the facts support.

Return JSON matching exactly this shape:
${COMPARE_JSON_SHAPE}`;

export function buildComparePrompt(a: LibraryData, b: LibraryData): string {
  return [
    "Compare these two libraries.",
    "",
    "LIBRARY A:",
    describeLibrary(a),
    "",
    "LIBRARY B:",
    describeLibrary(b),
    "",
    "Return the JSON object now.",
  ].join("\n");
}

function describeLibrary(lib: LibraryData): string {
  const facts: string[] = [
    `name: ${lib.name}`,
    `source: ${lib.source}`,
  ];
  if (lib.description) facts.push(`description: ${lib.description}`);
  if (lib.language) facts.push(`language: ${lib.language}`);
  if (lib.version) facts.push(`version: ${lib.version}`);
  if (lib.license) facts.push(`license: ${lib.license}`);
  if (lib.dependencies !== undefined) facts.push(`dependency count: ${lib.dependencies}`);
  if (lib.weeklyDownloads !== undefined)
    facts.push(`weekly downloads: ${lib.weeklyDownloads}`);
  if (lib.stars !== undefined) facts.push(`stars: ${lib.stars}`);
  if (lib.lastActivity) facts.push(`last activity: ${lib.lastActivity}`);
  return facts.map((f) => `- ${f}`).join("\n");
}
