import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { tables, strikethrough } from "turndown-plugin-gfm";
import { SignalCutError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface ExtractedDoc {
  url: string;
  title: string;
  /** Cleaned content as markdown, ready to feed to an LLM. */
  markdown: string;
  /** Character count of the markdown before any truncation. */
  originalLength: number;
  /** True if the content was truncated to fit the budget. */
  truncated: boolean;
}

/** Default upper bound on characters sent to the model (~ keeps token cost sane). */
const DEFAULT_MAX_CHARS = 24_000;
const FETCH_TIMEOUT_MS = 20_000;

const turndown = buildTurndown();

export async function extractFromUrl(
  url: string,
  options: { maxChars?: number } = {},
): Promise<ExtractedDoc> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  validateUrl(url);

  logger.step(`Fetching ${url}`);
  const html = await fetchHtml(url);

  logger.step("Extracting main content");
  const { title, markdown: fullMarkdown } = htmlToCleanMarkdown(html, url);

  if (!fullMarkdown.trim()) {
    throw new SignalCutError("No readable content found at that URL.", {
      hint: "The page may be JavaScript-rendered or behind a login. Try a direct docs URL.",
    });
  }

  const originalLength = fullMarkdown.length;
  let markdown = fullMarkdown;
  let truncated = false;
  if (markdown.length > maxChars) {
    markdown = `${truncateAtBoundary(markdown, maxChars)}\n\n[... content truncated ...]`;
    truncated = true;
  }

  return { url, title, markdown, originalLength, truncated };
}

/**
 * Pure HTML -> clean markdown transform (no network). Isolates the main content,
 * converts to markdown, and strips boilerplate. Exported so extraction quality
 * can be tested against fixtures without hitting the network.
 */
export function htmlToCleanMarkdown(
  html: string,
  url: string,
): { title: string; markdown: string } {
  const { title, contentHtml } = isolateMainContent(html, url);
  const markdown = cleanMarkdown(htmlToMarkdown(contentHtml));
  return { title, markdown };
}

// ---------------------------------------------------------------------------
// Turndown configuration
// ---------------------------------------------------------------------------

function buildTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });

  // GFM tables + strikethrough matter a lot for developer docs (API tables,
  // parameter grids). The default Turndown drops table structure entirely.
  td.use([tables, strikethrough]);

  // Drop non-content nodes outright rather than converting them.
  // (svg isn't in Turndown's tag-name union, so cast the list.)
  td.remove(
    ["script", "style", "noscript", "iframe", "svg", "form"] as unknown as Parameters<
      TurndownService["remove"]
    >[0],
  );

  // Preserve fenced code blocks *with their language*. Docs annotate code with
  // class="language-ts" / "lang-python" / data-lang, which the default rule
  // discards — losing that hint hurts downstream analysis.
  td.addRule("fencedCodeWithLang", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      (node.firstChild?.nodeName === "CODE" || node.textContent !== null),
    replacement: (_content, node) => {
      const el = node as unknown as HTMLElement;
      const code = el.querySelector("code") ?? el;
      const language = detectLanguage(el, code as HTMLElement);
      const text = (code.textContent ?? "").replace(/\n$/, "");
      const fence = text.includes("```") ? "~~~" : "```";
      return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
    },
  });

  return td;
}

function detectLanguage(pre: HTMLElement, code: HTMLElement): string {
  const classAttr = `${code.getAttribute("class") ?? ""} ${pre.getAttribute("class") ?? ""}`;
  const match = classAttr.match(/(?:language|lang)-([A-Za-z0-9+#]+)/);
  if (match?.[1]) return match[1].toLowerCase();
  const dataLang =
    code.getAttribute("data-lang") ?? pre.getAttribute("data-lang") ?? "";
  return dataLang.toLowerCase();
}

// ---------------------------------------------------------------------------
// Fetch + content isolation
// ---------------------------------------------------------------------------

function validateUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SignalCutError(`"${url}" is not a valid URL.`, {
      hint: "Include the scheme, e.g. https://docs.example.com.",
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SignalCutError(`Unsupported URL scheme "${parsed.protocol}".`, {
      hint: "Only http and https URLs are supported.",
    });
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Present as a normal browser so docs sites serve full HTML.
        "user-agent":
          "Mozilla/5.0 (compatible; SignalCut/0.1; +https://github.com/signalcut)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new SignalCutError(
        `Failed to fetch page (HTTP ${response.status} ${response.statusText}).`,
        { hint: "Check the URL is reachable and public." },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      throw new SignalCutError(
        `Expected an HTML page but got "${contentType || "unknown content type"}".`,
        { hint: "Point SignalCut at a documentation web page, not a file download." },
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof SignalCutError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SignalCutError(
        `Timed out after ${FETCH_TIMEOUT_MS / 1000}s fetching the page.`,
      );
    }
    throw new SignalCutError("Network error while fetching the page.", {
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// Selectors for common documentation chrome Readability may not strip.
const CHROME_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  "script",
  "style",
  "noscript",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  ".sidebar",
  ".toc",
  ".table-of-contents",
  "[class*='cookie']",
  "[class*='consent']",
  "[id*='cookie']",
];

function isolateMainContent(
  html: string,
  url: string,
): { title: string; contentHtml: string } {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  doc.querySelectorAll(CHROME_SELECTORS.join(", ")).forEach((el) => el.remove());

  const documentTitle = doc.title?.trim() || "Untitled";

  try {
    // Clone so a Readability failure doesn't consume our fallback DOM.
    // keepClasses is essential: Readability strips class attributes by default,
    // which would drop the language-* hints our code-fence rule relies on.
    const reader = new Readability(doc.cloneNode(true) as Document, {
      keepClasses: true,
    });
    const article = reader.parse();
    if (article?.content && article.content.trim().length > 0) {
      return {
        title: (article.title || documentTitle).trim(),
        contentHtml: article.content,
      };
    }
  } catch {
    // Fall through to the raw body below.
  }

  const body = doc.body?.innerHTML ?? "";
  return { title: documentTitle, contentHtml: body };
}

function htmlToMarkdown(html: string): string {
  try {
    return turndown.turndown(html);
  } catch (cause) {
    throw new SignalCutError("Failed to convert page content to markdown.", {
      cause,
    });
  }
}

// ---------------------------------------------------------------------------
// Markdown cleanup
// ---------------------------------------------------------------------------

// Boilerplate lines that survive extraction on many docs platforms.
const BOILERPLATE_PATTERNS: RegExp[] = [
  /^on this page$/i,
  /^edit this page$/i,
  /^edit on github$/i,
  /^was this (page |article )?helpful\??$/i,
  /^skip to (main )?content$/i,
  /^table of contents$/i,
  /^copy(\s+code)?$/i,
  /^back to top$/i,
  /^previous$/i,
  /^next$/i,
];

function cleanMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/[ \t]+$/g, ""); // trailing whitespace
    const trimmed = line.trim();

    if (BOILERPLATE_PATTERNS.some((re) => re.test(trimmed))) continue;
    // Drop base64 image data URIs; they're huge and carry no engineering value.
    if (/!\[[^\]]*\]\(data:/.test(trimmed)) continue;

    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n") // collapse blank-line runs
    .replace(/^\s+|\s+$/g, ""); // trim ends
}

/** Truncate near a paragraph boundary so we don't cut mid-sentence. */
function truncateAtBoundary(markdown: string, maxChars: number): string {
  const slice = markdown.slice(0, maxChars);
  const lastBreak = slice.lastIndexOf("\n\n");
  if (lastBreak > maxChars * 0.6) {
    return slice.slice(0, lastBreak);
  }
  return slice;
}
