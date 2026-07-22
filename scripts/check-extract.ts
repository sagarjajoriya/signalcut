/**
 * Standalone extraction check (no network, no LLM). Bundled with tsup and run
 * with node to verify the HTML -> clean-markdown pipeline against a fixture.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

// Isolate all on-disk state to a throwaway dir before importing storage code.
const TMP = mkdtempSync(path.join(os.tmpdir(), "sc-check-"));
process.env.SIGNALCUT_HOME = TMP;

const { htmlToCleanMarkdown } = await import("../src/core/extractor.js");
const { buildCacheKey, hashContent, readCacheEntry, writeCacheEntry, clearCache } =
  await import("../src/storage/cache.js");
const { maskSecret } = await import("../src/utils/mask.js");

const FIXTURE = `<!doctype html>
<html>
  <head><title>Example API Docs</title></head>
  <body>
    <nav>Home | Docs | Pricing</nav>
    <header>Marketing banner: the fastest API ever!</header>
    <div class="cookie-consent">We use cookies. Accept?</div>
    <main>
      <article>
        <h1>Example API</h1>
        <p>Install and authenticate to get started.</p>
        <p>On this page</p>
        <h2>Install</h2>
        <pre><code class="language-bash">npm install example</code></pre>
        <h2>Usage</h2>
        <pre><code class="language-ts">const c = createClient({ apiKey: "x" });</code></pre>
        <h2>Parameters</h2>
        <table>
          <thead><tr><th>Name</th><th>Required</th></tr></thead>
          <tbody>
            <tr><td>apiKey</td><td>yes</td></tr>
            <tr><td>timeout</td><td>no</td></tr>
          </tbody>
        </table>
        <p>Edit this page</p>
      </article>
    </main>
    <footer>© 2026 Example Inc.</footer>
  </body>
</html>`;

const { title, markdown } = htmlToCleanMarkdown(FIXTURE, "https://docs.example.com");

console.log("--- extracted markdown ---\n" + markdown + "\n---------------------------");

// Title comes through.
assert.ok(/Example API/i.test(title), "title should be extracted");

// Code fences preserve their language.
assert.ok(markdown.includes("```bash"), "bash code fence with language");
assert.ok(markdown.includes("```ts"), "ts code fence with language");
assert.ok(markdown.includes("npm install example"), "install command preserved");

// GFM table survives conversion.
assert.ok(/\|\s*Name\s*\|/.test(markdown), "table header preserved");
assert.ok(/\|\s*apiKey\s*\|/.test(markdown), "table row preserved");

// Boilerplate / chrome is stripped.
assert.ok(!/on this page/i.test(markdown), "'On this page' removed");
assert.ok(!/edit this page/i.test(markdown), "'Edit this page' removed");
assert.ok(!/cookie/i.test(markdown), "cookie banner removed");
assert.ok(!/Home \| Docs \| Pricing/.test(markdown), "nav removed");

// Cache key + hash helpers are stable/deterministic.
const k1 = buildCacheKey({ a: "1", b: "2" });
const k2 = buildCacheKey({ b: "2", a: "1" });
assert.equal(k1, k2, "cache key is order-independent");
assert.equal(hashContent("abc"), hashContent("abc"), "content hash deterministic");
assert.notEqual(hashContent("abc"), hashContent("abd"), "content hash distinguishes input");

// Masking never reveals the full secret.
const masked = maskSecret("sk-1234567890abcdef");
assert.ok(!masked.includes("567890"), "masked secret hides the middle");
assert.ok(masked.startsWith("sk-1"), "masked secret keeps a short prefix");

// Cache write/read round-trip and expiry.
const key = buildCacheKey({ url: "https://x", model: "m", pipeline: 2 });
writeCacheEntry(key, { library: "X" }, { url: "https://x" });
const hit = readCacheEntry<{ library: string }>(key);
assert.deepEqual(hit, { library: "X" }, "cache round-trips the stored value");
assert.equal(readCacheEntry(key, 0), undefined, "zero TTL treats entry as expired");
assert.equal(readCacheEntry("does-not-exist"), undefined, "missing key is a miss");
assert.equal(clearCache(), 1, "clearCache removes the entry");

rmSync(TMP, { recursive: true, force: true });
console.log("\nAll extraction + cache checks passed ✓");
