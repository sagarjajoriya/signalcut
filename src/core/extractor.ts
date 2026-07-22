import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
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

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
// Drop non-content nodes outright rather than converting them.
// (svg isn't in Turndown's tag-name union, so cast the list.)
turndown.remove(
  ["script", "style", "noscript", "iframe", "svg", "form"] as unknown as Parameters<
    TurndownService["remove"]
  >[0],
);

export async function extractFromUrl(
  url: string,
  options: { maxChars?: number } = {},
): Promise<ExtractedDoc> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  validateUrl(url);

  logger.step(`Fetching ${url}`);
  const html = await fetchHtml(url);

  logger.step("Extracting main content");
  const { title, contentHtml } = isolateMainContent(html, url);

  let markdown = htmlToMarkdown(contentHtml);
  markdown = normalizeWhitespace(markdown);

  if (!markdown.trim()) {
    throw new SignalCutError("No readable content found at that URL.", {
      hint: "The page may be JavaScript-rendered or behind a login. Try a direct docs URL.",
    });
  }

  const originalLength = markdown.length;
  let truncated = false;
  if (markdown.length > maxChars) {
    markdown = `${markdown.slice(0, maxChars)}\n\n[... content truncated ...]`;
    truncated = true;
  }

  return { url, title, markdown, originalLength, truncated };
}

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

function isolateMainContent(
  html: string,
  url: string,
): { title: string; contentHtml: string } {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Strip obvious chrome before Readability runs, as a belt-and-braces measure.
  doc
    .querySelectorAll("nav, header, footer, aside, script, style, noscript")
    .forEach((el) => el.remove());

  const documentTitle = doc.title?.trim() || "Untitled";

  try {
    const reader = new Readability(doc);
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

  // Fallback: use the body if Readability could not identify an article.
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

function normalizeWhitespace(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n") // trailing spaces
    .replace(/\n{3,}/g, "\n\n") // collapse blank-line runs
    .trim();
}
