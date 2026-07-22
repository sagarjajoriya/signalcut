import { GITHUB_JSON_SHAPE } from "./schema.js";
import type { RepoMeta, ReleaseInfo, IssueInfo } from "./client.js";

export const GITHUB_SYSTEM_PROMPT = `You are SignalCut, a repository intelligence engine for professional software engineers.

Your task: read the provided GitHub repository data (README, recent releases, and the most-discussed open issues) and extract ONLY concrete engineering facts a developer needs to evaluate and use the project.

Hard rules:
- Output MUST be a single valid JSON object. No prose, no markdown fences, no commentary.
- Extract, do not invent. If the data does not support a field, use an empty string or empty array.
- Strip marketing language and hype. Keep technical substance only.
- breakingChanges: derive from release notes / changelogs. Empty if none stated.
- commonProblems: derive from the open issues provided. Prefer issues with more comments. Cite issue numbers as "#<number>".
- maintenanceStatus: base this only on the given signals (archived flag, last push date, release cadence, issue activity).

Return JSON matching exactly this shape:
${GITHUB_JSON_SHAPE}`;

/** Cap each corpus section so the combined prompt stays within a sane budget. */
const README_CHARS = 8_000;
const RELEASE_CHARS = 1_200;
const ISSUE_CHARS = 600;

export interface GithubCorpus {
  meta: RepoMeta;
  readme: string;
  releases: ReleaseInfo[];
  issues: IssueInfo[];
}

export function buildGithubUserPrompt(corpus: GithubCorpus): string {
  const { meta, readme, releases, issues } = corpus;

  const releasesText =
    releases.length > 0
      ? releases
          .map(
            (r) =>
              `### ${r.tag}${r.name ? ` — ${r.name}` : ""} (${r.publishedAt ?? "n/a"})\n${truncate(r.body, RELEASE_CHARS)}`,
          )
          .join("\n\n")
      : "(no releases)";

  const issuesText =
    issues.length > 0
      ? issues
          .map(
            (i) =>
              `- #${i.number} [${i.comments} comments${i.labels.length ? `, labels: ${i.labels.join(", ")}` : ""}] ${i.title}\n  ${truncate(oneLine(i.body), ISSUE_CHARS)}`,
          )
          .join("\n")
      : "(no open issues)";

  return [
    `Repository: ${meta.fullName}`,
    `Description: ${meta.description ?? "(none)"}`,
    `Primary language: ${meta.language ?? "unknown"}`,
    `Stars: ${meta.stars} | Open issues: ${meta.openIssues} | Archived: ${meta.archived}`,
    `Last push: ${meta.pushedAt ?? "unknown"} | License: ${meta.license ?? "none"}`,
    "",
    "===== README =====",
    truncate(readme, README_CHARS) || "(no README)",
    "",
    "===== RECENT RELEASES =====",
    releasesText,
    "",
    "===== TOP OPEN ISSUES (most discussed) =====",
    issuesText,
    "",
    "Return the JSON object now.",
  ].join("\n");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[... truncated ...]`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
