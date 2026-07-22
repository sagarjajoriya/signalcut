/** Static metadata describing a provider. Contains no secrets. */
export interface ProviderInfo {
  /** Stable identifier used in config and on the CLI, e.g. "openai". */
  id: string;
  /** Human-readable name, e.g. "OpenAI". */
  label: string;
  /** Model used when the user has not chosen one. */
  defaultModel: string;
  /** Environment variable checked as a fallback source for the API key. */
  envVar: string;
  /** Where to obtain an API key. */
  keysUrl: string;
  /** Whether the provider is wired up for live calls yet. */
  implemented: boolean;
}

export interface CompletionRequest {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /** Request strict JSON output when the provider supports it. */
  json: boolean;
  temperature?: number;
  /** Upper bound on output tokens. */
  maxOutputTokens?: number;
}

/**
 * The single seam every LLM backend implements. Adding a provider means adding
 * one file that returns { info, complete } — nothing else in the codebase needs
 * to know which backend is in use.
 */
export interface LLMProvider {
  readonly info: ProviderInfo;
  /** Send a completion request and return the raw text content. */
  complete(request: CompletionRequest): Promise<string>;
}
