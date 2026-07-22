import pc from "picocolors";
import type { RepoMeta } from "../github/client.js";
import type { GithubInsights } from "../github/schema.js";

const RULE = "=".repeat(64);

export function renderGithubInsights(meta: RepoMeta, insights: GithubInsights): string {
  const lines: string[] = [];
  const section = (heading: string) => {
    lines.push("", pc.bold(heading), "");
  };

  lines.push(RULE, "", pc.bold("SIGNALCUT · GITHUB INSIGHTS"), "");
  lines.push(pc.cyan(meta.fullName));
  if (meta.description) lines.push(pc.dim(meta.description));

  // Factual repo stats — straight from the API, not the model.
  section("Repository");
  lines.push(`Language:    ${meta.language ?? "unknown"}`);
  lines.push(`Stars:       ${meta.stars.toLocaleString()}`);
  lines.push(`Open issues: ${meta.openIssues.toLocaleString()}`);
  lines.push(`License:     ${meta.license ?? "none"}`);
  lines.push(`Last push:   ${formatDate(meta.pushedAt)}`);
  lines.push(`Archived:    ${meta.archived ? pc.yellow("yes") : "no"}`);

  section("Summary");
  lines.push(insights.summary || "—");

  if (insights.maintenanceStatus) {
    section("Maintenance Status");
    lines.push(insights.maintenanceStatus);
  }

  if (insights.installation.length > 0) {
    section("Installation");
    for (const step of insights.installation) lines.push(step);
  }

  if (insights.usage.length > 0) {
    section("Usage");
    for (const u of insights.usage) lines.push(u);
  }

  if (insights.breakingChanges.length > 0) {
    section("Breaking Changes");
    for (const b of insights.breakingChanges) lines.push(`- ${b}`);
  }

  if (insights.commonProblems.length > 0) {
    section("Common Problems");
    insights.commonProblems.forEach((p, index) => {
      if (index > 0) lines.push("");
      const refs = p.issues.length > 0 ? pc.dim(` (${p.issues.join(", ")})`) : "";
      lines.push(`- ${p.problem}${refs}`);
      if (p.workaround) lines.push(`  ${pc.green("workaround:")} ${p.workaround}`);
    });
  }

  if (insights.knownWorkarounds.length > 0) {
    section("Known Workarounds");
    for (const w of insights.knownWorkarounds) lines.push(`- ${w}`);
  }

  lines.push("", RULE);
  return lines.join("\n");
}

function formatDate(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
