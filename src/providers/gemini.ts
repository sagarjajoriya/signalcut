import { GoogleGenAI, ApiError } from "@google/genai";
import type { CompletionRequest, LLMProvider, ProviderInfo } from "./types.js";
import { SignalCutError } from "../utils/errors.js";

const info: ProviderInfo = {
  id: "gemini",
  label: "Google Gemini",
  defaultModel: "gemini-1.5-flash",
  envVar: "GEMINI_API_KEY",
  keysUrl: "https://aistudio.google.com/app/apikey",
  implemented: true,
};

export const geminiProvider: LLMProvider = {
  info,

  async complete(request: CompletionRequest): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: request.apiKey });

    try {
      const response = await ai.models.generateContent({
        model: request.model,
        contents: request.user,
        config: {
          systemInstruction: request.system,
          temperature: request.temperature ?? 0.1,
          maxOutputTokens: request.maxOutputTokens ?? 4096,
          // Gemini's native JSON mode: constrains output to a valid JSON value.
          ...(request.json ? { responseMimeType: "application/json" } : {}),
        },
      });

      const text = response.text;
      if (!text) {
        throw new SignalCutError("Gemini returned an empty response.");
      }
      return text;
    } catch (error) {
      throw translateGeminiError(error);
    }
  },
};

function translateGeminiError(error: unknown): SignalCutError {
  if (error instanceof SignalCutError) return error;
  if (error instanceof ApiError) {
    const status = error.status;
    if (status === 400 || status === 401 || status === 403) {
      return new SignalCutError(`Gemini rejected the API key (${status}).`, {
        hint: 'Re-add it with "signalcut config set gemini".',
        cause: error,
      });
    }
    if (status === 429) {
      return new SignalCutError("Gemini rate limit or quota exceeded (429).", {
        hint: "Wait and retry, or check your plan's usage limits.",
        cause: error,
      });
    }
    if (status === 404) {
      return new SignalCutError("Gemini model not found (404).", {
        hint: 'Set a valid model with "signalcut config model gemini <model>".',
        cause: error,
      });
    }
    return new SignalCutError(`Gemini request failed: ${error.message}`, {
      cause: error,
    });
  }
  return new SignalCutError("Unexpected error calling Gemini.", { cause: error });
}
