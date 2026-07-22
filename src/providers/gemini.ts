import type { CompletionRequest, LLMProvider, ProviderInfo } from "./types.js";
import { SignalCutError } from "../utils/errors.js";

const info: ProviderInfo = {
  id: "gemini",
  label: "Google Gemini",
  defaultModel: "gemini-1.5-flash",
  envVar: "GEMINI_API_KEY",
  keysUrl: "https://aistudio.google.com/app/apikey",
  implemented: false,
};

export const geminiProvider: LLMProvider = {
  info,
  async complete(_request: CompletionRequest): Promise<string> {
    throw new SignalCutError("The Gemini provider is not implemented yet.", {
      hint: 'Phase 1 supports OpenAI. Run "signalcut config provider openai".',
    });
  },
};
