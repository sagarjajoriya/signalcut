import { getProvider } from "../providers/registry.js";
import type { LLMProvider } from "../providers/types.js";
import {
  getActiveProvider,
  getProviderModel,
  getStoredKey,
} from "../storage/credentials.js";
import { SignalCutError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export interface ResolvedRun {
  provider: LLMProvider;
  apiKey: string;
  model: string;
}

export interface ResolveOptions {
  /** Explicit provider id from a --provider flag. */
  provider?: string;
  /** Explicit model from a --model flag. */
  model?: string;
}

/**
 * Work out which provider, key, and model a command should use. Precedence:
 *   provider: --provider flag  >  active provider in config
 *   key:      stored (encrypted) key  >  provider's env var
 *   model:    --model flag  >  configured model  >  provider default
 */
export function resolveRun(options: ResolveOptions): ResolvedRun {
  const providerId = options.provider ?? getActiveProvider();
  if (!providerId) {
    throw new SignalCutError("No provider configured.", {
      hint: 'Run "signalcut config provider openai" (then "signalcut config set openai").',
    });
  }

  const provider = getProvider(providerId);
  if (!provider.info.implemented) {
    throw new SignalCutError(
      `The ${provider.info.label} provider is not available yet.`,
      { hint: 'Phase 1 supports OpenAI. Run "signalcut config provider openai".' },
    );
  }

  const apiKey = resolveKey(provider);
  const model =
    options.model ?? getProviderModel(providerId) ?? provider.info.defaultModel;

  return { provider, apiKey, model };
}

function resolveKey(provider: LLMProvider): string {
  const stored = getStoredKey(provider.info.id);
  if (stored) return stored;

  const fromEnv = process.env[provider.info.envVar];
  if (fromEnv && fromEnv.trim()) {
    logger.debug(`Using ${provider.info.envVar} from the environment.`);
    return fromEnv.trim();
  }

  throw new SignalCutError(`No API key found for ${provider.info.label}.`, {
    hint: `Run "signalcut config set ${provider.info.id}", or set ${provider.info.envVar} in your environment.`,
  });
}
