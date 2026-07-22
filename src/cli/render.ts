import pc from "picocolors";
import type { Analysis } from "../core/schema.js";

const RULE = "=".repeat(64);

/**
 * Render a structured Analysis into the SignalCut report format: a fixed set of
 * sections, blank ones omitted, no decoration beyond simple headings. Built as
 * a string so callers can print it or redirect it cleanly.
 */
export function renderAnalysis(
  analysis: Analysis,
  meta: { url: string },
): string {
  const lines: string[] = [];
  const section = (heading: string) => {
    lines.push("", pc.bold(heading), "");
  };

  lines.push(RULE, "", pc.bold("SIGNALCUT ANALYSIS"), "");
  lines.push(pc.dim(`Source: ${meta.url}`));

  section("Library");
  lines.push(analysis.library || "Unknown");

  section("Purpose");
  lines.push(wrap(analysis.purpose || "—"));

  if (analysis.installation.length > 0) {
    section("Installation");
    for (const step of analysis.installation) lines.push(step);
  }

  if (analysis.authentication && analysis.authentication.trim()) {
    section("Authentication");
    lines.push(wrap(analysis.authentication));
  }

  if (analysis.coreApis.length > 0) {
    section("Core APIs");
    analysis.coreApis.forEach((api, index) => {
      if (index > 0) lines.push("");
      lines.push(pc.cyan(api.signature));
      if (api.description) lines.push(wrap(api.description));
      if (api.parameters.length > 0) {
        lines.push("  Parameters:");
        for (const p of api.parameters) {
          const req = p.required ? "required" : "optional";
          const type = p.type ? ` <${p.type}>` : "";
          const desc = p.description ? ` — ${p.description}` : "";
          lines.push(`  - ${p.name}${type} (${req})${desc}`);
        }
      }
      if (api.returns) lines.push(`  Returns: ${api.returns}`);
    });
  }

  if (analysis.examples.length > 0) {
    section("Code Examples");
    analysis.examples.forEach((ex, index) => {
      if (index > 0) lines.push("");
      if (ex.title) lines.push(pc.dim(`# ${ex.title}`));
      lines.push("```" + (ex.language ?? ""));
      lines.push(ex.code.trimEnd());
      lines.push("```");
    });
  }

  if (analysis.performanceNotes.length > 0) {
    section("Performance Notes");
    for (const p of analysis.performanceNotes) lines.push(`- ${p}`);
  }

  if (analysis.limitations.length > 0) {
    section("Limitations");
    for (const l of analysis.limitations) lines.push(`- ${l}`);
  }

  if (analysis.breakingChanges.length > 0) {
    section("Breaking Changes");
    for (const b of analysis.breakingChanges) lines.push(`- ${b}`);
  }

  if (analysis.errors.length > 0) {
    section("Common Errors");
    for (const e of analysis.errors) {
      lines.push(`${pc.yellow(e.code)}: ${e.meaning}`);
    }
  }

  if (analysis.dependencies.length > 0) {
    section("Dependencies");
    for (const d of analysis.dependencies) lines.push(`- ${d}`);
  }

  lines.push("", RULE);
  return lines.join("\n");
}

/** Soft-wrap a paragraph at ~80 columns for readable terminal output. */
function wrap(text: string, width = 80): string {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out.join("\n");
}
