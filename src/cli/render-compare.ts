import pc from "picocolors";
import type { CompareResult } from "../core/comparator.js";
import type { LibraryData } from "../core/comparator.js";

const RULE = "=".repeat(72);
const MAX_COL = 30;

export function renderComparison(result: CompareResult): string {
  const { a, b, comparison } = result;
  const lines: string[] = [];

  lines.push(RULE, "", pc.bold("SIGNALCUT · LIBRARY COMPARISON"), "");

  // Deterministic, factual rows — straight from npm/GitHub, never the model.
  const rows: [string, string, string][] = [
    ["Language", a.language ?? "—", b.language ?? "—"],
    ["Latest version", a.version ?? "—", b.version ?? "—"],
    ["License", a.license ?? "—", b.license ?? "—"],
    ["Dependencies", fmtNum(a.dependencies), fmtNum(b.dependencies)],
    ["Install size", fmtBytes(a.installSize), fmtBytes(b.installSize)],
    ["Weekly downloads", fmtCompact(a.weeklyDownloads), fmtCompact(b.weeklyDownloads)],
    ["Stars", fmtCompact(a.stars), fmtCompact(b.stars)],
    ["Open issues", fmtNum(a.openIssues), fmtNum(b.openIssues)],
    ["Last activity", fmtDate(a.lastActivity), fmtDate(b.lastActivity)],
    ["Maintenance", a.maintenance, b.maintenance],
  ];

  lines.push(...formatTable(a, b, rows));

  // Qualitative sections from the model.
  pairSection(lines, "Performance", comparison.performance.a, comparison.performance.b, a, b);
  pairListSection(lines, "Limitations", comparison.limitations.a, comparison.limitations.b, a, b);
  pairSection(lines, "Best for", comparison.bestFor.a, comparison.bestFor.b, a, b);

  if (comparison.summary.trim()) {
    lines.push("", pc.bold("Bottom line"), "", wrap(comparison.summary, 72));
  }

  lines.push("", RULE);
  return lines.join("\n");
}

function formatTable(
  a: LibraryData,
  b: LibraryData,
  rows: [string, string, string][],
): string[] {
  const nameA = truncate(a.name, MAX_COL);
  const nameB = truncate(b.name, MAX_COL);
  const labelW = Math.max(...rows.map((r) => r[0].length), "Feature".length);
  const colA = Math.max(...rows.map((r) => r[1].length), nameA.length);
  const colB = Math.max(...rows.map((r) => r[2].length), nameB.length);

  const line = (l: string, x: string, y: string) =>
    `${l.padEnd(labelW)}  ${x.padEnd(colA)}  ${y.padEnd(colB)}`;

  const out: string[] = [];
  out.push(pc.bold(line("Feature", nameA, nameB)));
  out.push(pc.dim(line("-".repeat(labelW), "-".repeat(colA), "-".repeat(colB))));
  for (const [label, x, y] of rows) {
    out.push(line(label, x, y));
  }
  return out;
}

function pairSection(
  lines: string[],
  heading: string,
  a: string,
  b: string,
  la: LibraryData,
  lb: LibraryData,
): void {
  if (!a.trim() && !b.trim()) return;
  lines.push("", pc.bold(heading), "");
  lines.push(`${pc.cyan(la.name)}: ${a.trim() || "—"}`);
  lines.push(`${pc.cyan(lb.name)}: ${b.trim() || "—"}`);
}

function pairListSection(
  lines: string[],
  heading: string,
  a: string[],
  b: string[],
  la: LibraryData,
  lb: LibraryData,
): void {
  if (a.length === 0 && b.length === 0) return;
  lines.push("", pc.bold(heading), "");
  lines.push(pc.cyan(la.name) + ":");
  for (const item of a.length ? a : ["—"]) lines.push(`  - ${item}`);
  lines.push(pc.cyan(lb.name) + ":");
  for (const item of b.length ? b : ["—"]) lines.push(`  - ${item}`);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number | undefined): string {
  return n === undefined ? "—" : n.toLocaleString();
}

function fmtCompact(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "—";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function wrap(text: string, width: number): string {
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
