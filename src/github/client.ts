import { SignalCutError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { getGithubToken } from "../storage/credentials.js";

const API_ROOT = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 20_000;

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface RepoMeta {
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  openIssues: number;
  license: string | null;
  archived: boolean;
  pushedAt: string | null;
  homepage: string | null;
  topics: string[];
}

export interface ReleaseInfo {
  tag: string;
  name: string | null;
  publishedAt: string | null;
  body: string;
}

export interface IssueInfo {
  number: number;
  title: string;
  comments: number;
  labels: string[];
  state: string;
  body: string;
}

/**
 * Parse "owner/repo" or a github.com URL into a RepoRef. Accepts optional
 * trailing paths and .git suffixes so pasted URLs just work.
 */
export function parseRepoRef(input: string): RepoRef {
  const trimmed = input.trim();

  let candidate = trimmed;
  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
  if (urlMatch) {
    candidate = `${urlMatch[1]}/${urlMatch[2]}`;
  }

  const parts = candidate.replace(/\.git$/i, "").split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new SignalCutError(`"${input}" is not a valid repository reference.`, {
      hint: "Use owner/repo, e.g. \"signalcut github facebook/react\".",
    });
  }
  return { owner: parts[0], repo: parts[1] };
}

export class GithubClient {
  private readonly token: string | undefined;

  constructor() {
    this.token = getGithubToken() ?? process.env.GITHUB_TOKEN?.trim() ?? undefined;
    logger.debug(this.token ? "Using an authenticated GitHub token." : "GitHub: unauthenticated.");
  }

  async getRepo(ref: RepoRef): Promise<RepoMeta> {
    const data = await this.request<GithubRepoResponse>(
      `/repos/${ref.owner}/${ref.repo}`,
    );
    return {
      fullName: data.full_name,
      description: data.description,
      language: data.language,
      stars: data.stargazers_count ?? 0,
      openIssues: data.open_issues_count ?? 0,
      license: data.license?.spdx_id ?? data.license?.name ?? null,
      archived: Boolean(data.archived),
      pushedAt: data.pushed_at ?? null,
      homepage: data.homepage || null,
      topics: data.topics ?? [],
    };
  }

  async getReadme(ref: RepoRef): Promise<string> {
    try {
      const data = await this.request<{ content?: string; encoding?: string }>(
        `/repos/${ref.owner}/${ref.repo}/readme`,
      );
      if (data.content && data.encoding === "base64") {
        return Buffer.from(data.content, "base64").toString("utf8");
      }
      return "";
    } catch (error) {
      // A missing README is not fatal — carry on with the other signals.
      if (error instanceof SignalCutError && error.exitCode === 44) return "";
      throw error;
    }
  }

  async getReleases(ref: RepoRef, limit = 5): Promise<ReleaseInfo[]> {
    const data = await this.request<GithubReleaseResponse[]>(
      `/repos/${ref.owner}/${ref.repo}/releases?per_page=${limit}`,
    );
    return data.map((r) => ({
      tag: r.tag_name,
      name: r.name,
      publishedAt: r.published_at,
      body: r.body ?? "",
    }));
  }

  /** Most-discussed open issues (proxy for common problems). PRs are excluded. */
  async getTopIssues(ref: RepoRef, limit = 15): Promise<IssueInfo[]> {
    const data = await this.request<GithubIssueResponse[]>(
      `/repos/${ref.owner}/${ref.repo}/issues?state=open&sort=comments&direction=desc&per_page=${limit}`,
    );
    return data
      .filter((i) => !i.pull_request) // the issues endpoint also returns PRs
      .map((i) => ({
        number: i.number,
        title: i.title,
        comments: i.comments ?? 0,
        labels: (i.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)),
        state: i.state,
        body: i.body ?? "",
      }));
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_ROOT}${path}`, {
        signal: controller.signal,
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "SignalCut/0.1",
          "x-github-api-version": "2022-11-28",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
      });

      if (!response.ok) {
        throw this.translateHttpError(response, path);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof SignalCutError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SignalCutError(`Timed out calling the GitHub API (${path}).`);
      }
      throw new SignalCutError("Network error calling the GitHub API.", {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private translateHttpError(response: Response, path: string): SignalCutError {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (response.status === 404) {
      // exitCode 44 is an internal marker so getReadme can treat 404 as "no readme".
      return new SignalCutError(`GitHub resource not found (${path}).`, {
        hint: "Check the owner/repo is correct and the repository is public.",
        exitCode: 44,
      });
    }
    if (response.status === 403 && remaining === "0") {
      return new SignalCutError("GitHub API rate limit exceeded.", {
        hint: this.token
          ? "Wait for the limit to reset (usually within the hour)."
          : 'Add a token to raise the limit: "signalcut config github-token".',
      });
    }
    if (response.status === 401) {
      return new SignalCutError("GitHub rejected the token (401).", {
        hint: 'Re-add it with "signalcut config github-token".',
      });
    }
    return new SignalCutError(
      `GitHub API request failed (HTTP ${response.status} ${response.statusText}).`,
    );
  }
}

// Minimal shapes for the subset of GitHub responses we consume.
interface GithubRepoResponse {
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count?: number;
  open_issues_count?: number;
  license?: { spdx_id?: string; name?: string } | null;
  archived?: boolean;
  pushed_at?: string;
  homepage?: string;
  topics?: string[];
}

interface GithubReleaseResponse {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  body?: string;
}

interface GithubIssueResponse {
  number: number;
  title: string;
  comments?: number;
  labels?: (string | { name: string })[];
  state: string;
  body?: string;
  pull_request?: unknown;
}
