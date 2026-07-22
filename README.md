# SignalCut

A CLI-first, **BYOK** (Bring Your Own Key) developer tool that extracts
noise-free technical documentation, API references, and GitHub insights.

Modern docs, blogs, and AI-generated articles bury the engineering signal under
marketing copy and filler. SignalCut reads a page and returns only what a
developer needs to actually use the thing: installation, auth, API surface,
parameters, examples, limitations, and errors.

> **Status:** Phase 5 — feature-complete MVP. All five phases are in: the CLI,
> encrypted BYOK storage, high-fidelity extraction, response cache, GitHub
> insights, the comparison engine, and **all three providers live** (OpenAI,
> Anthropic, Google Gemini). The package is publish-ready.

---

## Privacy model (read this first)

SignalCut is **Bring Your Own Key**. There is no SignalCut server and no account.

- **Your API key stays on your machine.** It is stored under `~/.signalcut/`,
  **encrypted at rest** with AES-256-GCM. The encryption key (`master.key`) is
  generated locally, stored with `0600` permissions, and never leaves your
  machine.
- **Your key is sent only to the provider you choose** (e.g. OpenAI), by that
  provider's official SDK, to run *your* requests. It goes nowhere else.
- **Your key is never logged and never printed.** It is masked (`sk-a…wxyz`)
  everywhere it appears.
- **You pay the provider directly** for your own token usage. SignalCut never
  proxies or meters your calls.

Threat model, in plain terms: encryption-at-rest protects your key from
accidental exposure — synced dotfiles, backups, a shared screen, a stray `cat`.
It does **not** defend against an attacker who already has full read access to
your home directory (they could read `master.key` too). A future phase can back
the master key with the OS keychain through the same interface.

---

## Requirements

- Node.js **18+**
- An API key from a supported provider: **OpenAI**, **Anthropic**, or
  **Google Gemini**

## Install

From npm (once published):

```bash
npm install -g signalcut
```

From source (current):

```bash
git clone <this-repo> && cd signalcut
npm install
npm run build
npm link          # exposes the `signalcut` command globally
```

## Quick start

```bash
# 1. Choose a provider (openai | anthropic | gemini)
signalcut config provider openai

# 2. Store your key (prompted securely; never shown, never logged)
signalcut config set openai

# 3. Analyze a docs page
signalcut summarize https://docs.example.com
```

All three providers are interchangeable — swap with `config provider <id>`, or
per-command with `--provider`. Set a specific model with
`config model <id> <model>` (defaults: `gpt-4o-mini`, `claude-3-5-sonnet-latest`,
`gemini-1.5-flash`).

Prefer not to store a key? Set an environment variable instead — SignalCut falls
back to it automatically:

```bash
export OPENAI_API_KEY=sk-...
signalcut summarize https://docs.example.com
```

## Commands

| Command | Description |
| --- | --- |
| `signalcut summarize <url>` | Extract structured engineering facts from a docs URL |
| `signalcut github <owner/repo>` | Extract insights from a GitHub repo (README, releases, issues) |
| `signalcut compare <libA> <libB>` | Compare two libraries across engineering dimensions |
| `signalcut config provider <id>` | Set the active provider (`openai`, `anthropic`, `gemini`) |
| `signalcut config set [id]` | Store an API key (securely prompted; defaults to active provider) |
| `signalcut config key` | Store a key for the active provider |
| `signalcut config list` | Show providers, active selection, masked key status, model |
| `signalcut config model <id> <model>` | Set the model for a provider |
| `signalcut config remove <id>` | Delete the stored key for a provider |
| `signalcut config github-token` | Store a GitHub token to raise API rate limits (optional) |
| `signalcut config path` | Print the config directory |
| `signalcut config reset` | Delete **all** local SignalCut data |
| `signalcut cache status` | Show cache location, entry count, and size |
| `signalcut cache clear` | Delete all cached analyses |
| `signalcut version` / `--version` | Print the version |
| `signalcut --help` | Full help |

### `summarize` options

| Flag | Description |
| --- | --- |
| `-p, --provider <id>` | Override the active provider for this run |
| `-m, --model <model>` | Override the configured model |
| `--json` | Output raw JSON instead of the formatted report |
| `--max-chars <n>` | Cap the characters of page content sent to the model |
| `--no-cache` | Skip the cache for this run (do not read or write) |
| `--refresh` | Ignore any cached result and overwrite it |
| `--verbose` | Print debug diagnostics to stderr |

### Caching

Analysis results are cached locally so re-running `summarize` on an unchanged
page is instant and free (no second LLM call). The cache key is derived from the
URL, provider, model, pipeline version, and a hash of the extracted content —
so if the page changes, or you switch model, the cache is bypassed
automatically. Cached data lives in `~/.signalcut/cache/` and contains only the
derived analysis of public pages — never your key. Use `--refresh` to force a
re-analysis, `--no-cache` to skip it entirely, and `signalcut cache clear` to
wipe it.

## GitHub insights

```bash
signalcut github facebook/react
signalcut github https://github.com/facebook/react   # URLs work too
```

`github` gathers a repository's public signals — metadata, README, the latest
releases, and the most-discussed open issues — and distills them into a
structured report: summary, maintenance status, installation, usage, breaking
changes (from release notes), and common problems with workarounds (from
issues, cited by issue number). The same `--provider`, `--model`, `--json`,
`--no-cache`, and `--refresh` flags apply.

The GitHub API works **unauthenticated** for public repos (60 requests/hour,
plenty for occasional use). If you hit the rate limit, store a token — no scopes
are needed for public repos — to raise it to 5,000/hour:

```bash
signalcut config github-token          # prompted securely; stored encrypted
# or: export GITHUB_TOKEN=ghp_...
```

The token is optional, stored with the same AES-256-GCM encryption as your LLM
keys, masked on display, and sent only to `api.github.com`.

## Comparing libraries

```bash
signalcut compare express fastify           # two npm packages
signalcut compare zod yup
signalcut compare vuejs/core facebook/react # or GitHub repos
```

`compare` is deliberately **fact-grounded** to avoid hallucination. Each library
is resolved and gathered from real sources:

- **npm registry** — latest version, license, dependency count, unpacked install
  size, last publish date, and the declared GitHub repository.
- **npm downloads API** — weekly download count.
- **GitHub** — language, stars, open issues, last push, archived flag.

Those become the **factual rows of the table directly** — the model never
touches them, so versions, sizes, and counts can't be invented. The LLM is asked
only for the dimensions that aren't in registry data: **performance
characteristics, limitations, "best for", and a bottom-line recommendation**.
Maintenance status is derived deterministically from the last-activity date and
archived flag. Accepts npm names, scoped packages (`@scope/name`), `owner/repo`,
or GitHub URLs, and supports the same `--json`, `--no-cache`, and `--refresh`
flags.

### Storing a key without a prompt (CI / scripts)

The interactive prompt never echoes your key. For automation, pipe it via stdin
so it never appears in `argv` or shell history:

```bash
echo "$OPENAI_API_KEY" | signalcut config set openai
```

## Example output

```
================================================================

SIGNALCUT ANALYSIS

Source: https://docs.example.com

Library
Example API

Purpose
A client for the Example service.

Installation
npm install example

Authentication
API key required, passed as `apiKey`.

Core APIs
createClient(options)
Creates a configured client instance.
  Parameters:
  - apiKey <string> (required) — service API key
  - timeout <number> (optional) — request timeout in ms
  Returns: Client instance

Performance Notes
- 100 requests/minute per key
- Responses cached server-side for 60s

Limitations
- Max request size 5 MB

Breaking Changes
- v2: `createClient` now requires `apiKey` (was optional in v1)

Common Errors
401: Invalid API key
429: Rate limit exceeded

================================================================
```

`stdout` carries the report only; all progress and diagnostics go to `stderr`,
so `signalcut summarize <url> > report.txt` and `--json | jq` work cleanly.

## Architecture

Clean, modular, single-responsibility layers. Adding a provider or a command
touches one place.

```
src/
  index.ts              # entry point + top-level error handling
  cli/
    program.ts          # builds the Commander program, global flags, help
    render.ts           # Analysis -> formatted report
    resolve.ts          # picks provider + key + model (flag > config > env/default)
    privacy.ts          # one-time privacy notice
    render-github.ts    # GithubInsights -> formatted report
    render-compare.ts   # CompareResult -> comparison table
    commands/
      summarize.ts      # summarize <url> (with caching)
      github.ts         # github <owner/repo>
      compare.ts        # compare <libA> <libB>
      config.ts         # config provider/set/key/list/model/remove/path/reset
      cache.ts          # cache status/clear
      version.ts        # version
  providers/            # one LLMProvider interface, one file per backend
    types.ts
    registry.ts         # the single place that knows all providers
    openai.ts           # implemented (chat completions, JSON mode)
    anthropic.ts        # implemented (messages API, JSON via assistant prefill)
    gemini.ts           # implemented (generateContent, JSON mime type)
  core/
    extractor.ts        # URL -> clean markdown (Readability + Turndown + GFM)
    prompt.ts           # strict, no-marketing extraction prompt
    schema.ts           # zod schema = single source of truth for output shape
    analyzer.ts         # markdown -> validated structured Analysis
    comparator.ts       # resolve + gather + deterministic rows + LLM + cache
    compare-schema.ts   # zod Comparison schema (qualitative rows only)
    compare-prompt.ts   # factual data packs -> strict compare prompt
  github/
    client.ts           # GitHub REST client (repo, readme, releases, issues)
    schema.ts           # zod GithubInsights schema
    prompt.ts           # repo corpus -> strict extraction prompt
    insights.ts         # gather + analyze + cache orchestration
  npm/
    client.ts           # npm registry metadata + weekly downloads + repo resolve
  storage/
    paths.ts            # ~/.signalcut locations (override with SIGNALCUT_HOME)
    crypto.ts           # AES-256-GCM encrypt/decrypt + local master key
    credentials.ts      # encrypted key store (+ GitHub token) + non-secret config
    cache.ts            # content-addressed analysis cache (TTL)
  utils/
    json.ts             # tolerant JSON-object extraction from model output
    errors.ts           # SignalCutError (clean, user-facing failures)
    logger.ts           # stderr diagnostics, stdout output
    mask.ts             # secret masking
    prompt-input.ts     # secure (no-echo) TTY prompt + stdin fallback
    version.ts
```

### Design decisions

- **Provider seam.** Every backend implements one interface,
  `{ info, complete(request) }`. The `registry` is the only file that enumerates
  providers, so a new one is a single file plus one line. `anthropic` and
  `gemini` are registered now as honest stubs — config works, live calls report
  "not implemented yet" — so the plumbing is provider-agnostic from day one.
- **Schema-driven output.** `core/schema.ts` (zod) both validates the model's
  JSON *and* supplies the field list embedded in the prompt, so the contract
  can't drift. The prompt forbids marketing language and invention: unknown
  fields come back empty rather than guessed.
- **stdout vs stderr.** The report (or `--json`) is the only thing on stdout;
  everything else is stderr. Pipes and redirects stay clean.
- **Secrets never touch argv or logs.** Keys are entered via a no-echo prompt or
  piped stdin, stored encrypted, and masked on display.

## Configuration & data

Everything lives under `~/.signalcut/` (override with `SIGNALCUT_HOME`):

| File | Contents | Secret? |
| --- | --- | --- |
| `config.json` | Active provider, per-provider model | No |
| `credentials.enc` | API keys, AES-256-GCM ciphertext | Encrypted |
| `master.key` | 32-byte local encryption key (`0600`) | Yes — never leaves machine |
| `.privacy-ack` | Marker that the privacy notice was shown | No |

## Local development

```bash
npm install          # install dependencies
npm run typecheck    # tsc --noEmit (strict mode)
npm run check        # run extraction + cache checks against fixtures (no network)
npm run build        # bundle to dist/ with tsup
npm run dev          # rebuild on change
node dist/index.js --help
```

`npm run check` exercises the HTML→markdown pipeline (code-fence languages,
tables, boilerplate stripping) and the cache round-trip against in-memory
fixtures — no network calls, no API key, no token spend.

Run against a throwaway config directory so you never touch your real keys:

```bash
export SIGNALCUT_HOME="$(mktemp -d)"
node dist/index.js config provider openai
echo "$OPENAI_API_KEY" | node dist/index.js config set openai
node dist/index.js summarize https://example.com
```

## Roadmap

- **Phase 1 — Core MVP (done):** CLI, encrypted config/key storage, OpenAI
  provider, `summarize`.
- **Phase 2 — Extraction & caching (done):** code-fence language preservation,
  GFM tables, boilerplate stripping, response cache, and richer output
  (performance notes, breaking changes).
- **Phase 3 — GitHub insights (done):** `signalcut github owner/repo` — README,
  releases, most-discussed issues, breaking changes, common problems; optional
  encrypted GitHub token.
- **Phase 4 — Comparison engine (done):** `signalcut compare libA libB` — a
  fact-grounded table from npm + GitHub, with the LLM filling only the
  qualitative rows.
- **Phase 5 — Providers & packaging (done):** Anthropic and Gemini providers
  live; package metadata, changelog, and a clean publish tarball.

## Publishing

The package is publish-ready. `files` whitelists only `dist/`, `README.md`,
`LICENSE`, and `CHANGELOG.md`; `prepack` rebuilds `dist/` and `prepublishOnly`
runs typecheck + checks + build first.

```bash
npm run typecheck && npm run check   # gate
npm pack --dry-run                   # inspect the tarball
npm publish                          # publishes publicly (npm login required)
```

## License

MIT — see [LICENSE](./LICENSE).
