# Changelog

All notable changes to SignalCut are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] — Unreleased

First release. Built in five phases.

### Added

- **CLI core** — `signalcut` command built on Commander with `--help`,
  `--version`, and `--verbose`; clean stdout/stderr separation so output pipes
  and redirects cleanly.
- **BYOK credential storage** — API keys stored locally under `~/.signalcut/`,
  encrypted at rest with AES-256-GCM under a local `0600` master key. Keys are
  never logged, masked on display, entered via a no-echo prompt or piped stdin,
  and sent only to the selected provider. One-time privacy notice on first use.
- **Providers** — pluggable `LLMProvider` seam with a registry. Ships **OpenAI**,
  **Anthropic**, and **Google Gemini**, each with structured-JSON output and
  mapped error handling (401/429/404). Adding a provider is one file.
- **`summarize <url>`** — fetches a docs page, isolates the main content
  (Readability + Turndown + GFM), preserves code-fence languages and tables,
  strips boilerplate, and extracts a structured, marketing-free report
  (overview, install, auth, API reference, parameters, examples, limitations,
  errors, dependencies, performance notes, breaking changes).
- **`github <owner/repo>`** — distills a repository's README, releases, and
  most-discussed issues into structured insights (summary, maintenance status,
  installation, usage, breaking changes, common problems + workarounds).
  Optional encrypted GitHub token via `config github-token`.
- **`compare <libA> <libB>`** — a fact-grounded comparison table built from the
  npm registry and GitHub (versions, sizes, downloads, stars, maintenance), with
  the LLM filling only the qualitative rows (performance, limitations, best-for).
- **Response cache** — content-addressed cache with TTL, keyed by inputs +
  pipeline version + content hash; `--no-cache` / `--refresh` flags and
  `cache status` / `cache clear`.
- **Config commands** — `config provider/set/key/list/model/remove/path/reset`
  and `config github-token`.

### Security

- Keys and tokens are never stored in plaintext, never logged, and never
  printed. See the README "Privacy model" section for the full threat model.
