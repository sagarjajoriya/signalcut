import type { CompletionRequest, LLMProvider, ProviderInfo } from "./types.js";
import { SignalCutError } from "../utils/errors.js";

const info: ProviderInfo = {
  id: "anthropic",
  label: "Anthropic",
  defaultModel: "claude-3-5-sonnet-latest",
  envVar: "ANTHROPIC_API_KEY",
  keysUrl: "https://console.anthropic.com/settings/keys",
  // Config (storing keys, selecting the provider) works today; live calls land
  // in a later phase. Registered now so the plumbing is provider-agnostic.
  implemented: false,
};

export const anthropicProvider: LLMProvider = {
  info,
  async complete(_request: CompletionRequest): Promise<string> {
    throw new SignalCutError("The Anthropic provider is not implemented yet.", {
      hint: 'Phase 1 supports OpenAI. Run "signalcut config provider openai".',
    });
  },
};
