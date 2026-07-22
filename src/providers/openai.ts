import OpenAI from "openai";
import type { CompletionRequest, LLMProvider, ProviderInfo } from "./types.js";
import { SignalCutError } from "../utils/errors.js";

const info: ProviderInfo = {
  id: "openai",
  label: "OpenAI",
  defaultModel: "gpt-4o-mini",
  envVar: "OPENAI_API_KEY",
  keysUrl: "https://platform.openai.com/api-keys",
  implemented: true,
};

export const openaiProvider: LLMProvider = {
  info,

  async complete(request: CompletionRequest): Promise<string> {
    const client = new OpenAI({ apiKey: request.apiKey });

    try {
      const response = await client.chat.completions.create({
        model: request.model,
        temperature: request.temperature ?? 0.1,
        ...(request.maxOutputTokens
          ? { max_tokens: request.maxOutputTokens }
          : {}),
        ...(request.json
          ? { response_format: { type: "json_object" as const } }
          : {}),
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new SignalCutError("OpenAI returned an empty response.");
      }
      return content;
    } catch (error) {
      throw translateOpenAIError(error);
    }
  },
};

function translateOpenAIError(error: unknown): SignalCutError {
  if (error instanceof SignalCutError) {
    return error;
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    if (status === 401) {
      return new SignalCutError("OpenAI rejected the API key (401).", {
        hint: 'Check the key with "signalcut config list" and re-add it with "signalcut config set openai".',
        cause: error,
      });
    }
    if (status === 429) {
      return new SignalCutError("OpenAI rate limit or quota exceeded (429).", {
        hint: "Wait and retry, or check your plan's usage limits.",
        cause: error,
      });
    }
    if (status === 404) {
      return new SignalCutError(`OpenAI model not found (404).`, {
        hint: 'Set a valid model with "signalcut config model openai <model>".',
        cause: error,
      });
    }
    return new SignalCutError(`OpenAI request failed: ${error.message}`, {
      cause: error,
    });
  }
  return new SignalCutError("Unexpected error calling OpenAI.", { cause: error });
}
