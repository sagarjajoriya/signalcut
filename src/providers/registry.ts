import type { LLMProvider, ProviderInfo } from "./types.js";
import { openaiProvider } from "./openai.js";
import { anthropicProvider } from "./anthropic.js";
import { geminiProvider } from "./gemini.js";
import { SignalCutError } from "../utils/errors.js";

/**
 * The provider registry is the one place that knows the full set of backends.
 * Register a new provider here and the rest of the CLI picks it up for free.
 */
const PROVIDERS: readonly LLMProvider[] = [
  openaiProvider,
  anthropicProvider,
  geminiProvider,
];

const byId = new Map<string, LLMProvider>(PROVIDERS.map((p) => [p.info.id, p]));

export function listProviders(): ProviderInfo[] {
  return PROVIDERS.map((p) => p.info);
}

export function getProviderInfo(id: string): ProviderInfo | undefined {
  return byId.get(id)?.info;
}

export function isKnownProvider(id: string): boolean {
  return byId.has(id);
}

export function getProvider(id: string): LLMProvider {
  const provider = byId.get(id);
  if (!provider) {
    const known = PROVIDERS.map((p) => p.info.id).join(", ");
    throw new SignalCutError(`Unknown provider "${id}".`, {
      hint: `Known providers: ${known}.`,
    });
  }
  return provider;
}
