import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, LLMProvider, ProviderInfo } from "./types.js";
import { SignalCutError } from "../utils/errors.js";

const info: ProviderInfo = {
  id: "anthropic",
  label: "Anthropic",
  defaultModel: "claude-3-5-sonnet-latest",
  envVar: "ANTHROPIC_API_KEY",
  keysUrl: "https://console.anthropic.com/settings/keys",
  implemented: true,
};

export const anthropicProvider: LLMProvider = {
  info,

  async complete(request: CompletionRequest): Promise<string> {
    const client = new Anthropic({ apiKey: request.apiKey });

    // Anthropic has no dedicated JSON mode. Prefilling the assistant turn with
    // "{" forces the model to continue a JSON object; we re-attach the "{" to
    // the returned text. Combined with the JSON-only system prompt this is a
    // reliable way to get clean structured output.
    const prefill = request.json;

    try {
      const message = await client.messages.create({
        model: request.model,
        max_tokens: request.maxOutputTokens ?? 4096,
        temperature: request.temperature ?? 0.1,
        system: request.system,
        messages: [
          { role: "user", content: request.user },
          ...(prefill
            ? [{ role: "assistant" as const, content: "{" }]
            : []),
        ],
      });

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      if (!text) {
        throw new SignalCutError("Anthropic returned an empty response.");
      }
      return prefill ? `{${text}` : text;
    } catch (error) {
      throw translateAnthropicError(error);
    }
  },
};

function translateAnthropicError(error: unknown): SignalCutError {
  if (error instanceof SignalCutError) return error;
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    if (status === 401) {
      return new SignalCutError("Anthropic rejected the API key (401).", {
        hint: 'Re-add it with "signalcut config set anthropic".',
        cause: error,
      });
    }
    if (status === 429) {
      return new SignalCutError("Anthropic rate limit or quota exceeded (429).", {
        hint: "Wait and retry, or check your plan's usage limits.",
        cause: error,
      });
    }
    if (status === 404) {
      return new SignalCutError("Anthropic model not found (404).", {
        hint: 'Set a valid model with "signalcut config model anthropic <model>".',
        cause: error,
      });
    }
    return new SignalCutError(`Anthropic request failed: ${error.message}`, {
      cause: error,
    });
  }
  return new SignalCutError("Unexpected error calling Anthropic.", { cause: error });
}
