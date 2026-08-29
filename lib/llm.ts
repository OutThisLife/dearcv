import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defaultSettingsMiddleware, wrapLanguageModel } from "ai";
import { PROVIDERS, type LlmProvider } from "@/lib/providers";

// Picking a model is our job, not the user's. RESUME_MODEL is the
// self-hoster escape hatch. Flash-class is enough for JSON + tools.
const DEFAULT_MODEL: Record<LlmProvider, string> = {
  openrouter: "z-ai/glm-5.3-flash",
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-4-20250514",
};

const isProvider = (value: string): value is LlmProvider =>
  PROVIDERS.some((provider) => provider.id === value);

export function readLlmRequest(req: Request) {
  const headerKey = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const apiKey = headerKey || process.env.OPENROUTER_API_KEY || "";
  const requested = req.headers.get("x-resume-provider") || process.env.RESUME_PROVIDER || "";
  const provider = isProvider(requested) ? requested : "openrouter";
  const model = process.env.RESUME_MODEL || DEFAULT_MODEL[provider];

  return { apiKey, provider, model };
}

/**
 * One provider, two models: `model` drives the tool loop, `object` generates a
 * ResumeDoc. Structured output runs non-strict because ResumeDoc uses
 * `.optional()`, which strict JSON schema rejects.
 */
export function createModel(input: {
  apiKey: string;
  provider: LlmProvider;
  model: string;
  sessionId?: string;
}) {
  if (input.provider === "openai") {
    const model = createOpenAI({ apiKey: input.apiKey })(input.model);
    return {
      model,
      object: wrapLanguageModel({
        model,
        middleware: defaultSettingsMiddleware({
          settings: { providerOptions: { openai: { strictJsonSchema: false } } },
        }),
      }),
      openrouter: null,
    };
  }
  if (input.provider === "anthropic") {
    const model = createAnthropic({ apiKey: input.apiKey })(input.model);
    return { model, object: model, openrouter: null };
  }

  const openrouter = createOpenRouter({
    apiKey: input.apiKey,
    compatibility: "strict",
    appName: "DearCV",
    appUrl: "https://brooklyn.sh",
  });
  // Sticky routing keeps the cached prefix on one provider across turns.
  const extraBody = input.sessionId ? { session_id: input.sessionId } : undefined;

  return {
    model: openrouter(input.model, {
      reasoning: { effort: "low" },
      provider: { require_parameters: true, sort: "throughput" },
      // Lets any model read an attached PDF, including ones with no native
      // file input. Pin the engine: left unset OpenRouter falls back to
      // Mistral OCR at $2 per 1000 pages, billed to the account even under
      // BYOK. Resume exports are text, not scans, so the free one reads them
      // just as well.
      plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }],
      extraBody,
    }),
    object: openrouter(input.model, {
      plugins: [{ id: "response-healing" }],
      structuredOutputs: { strict: false },
      reasoning: { effort: "low" },
      extraBody,
    }),
    openrouter,
  };
}

export function llmErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/auth|api[- ]?key|credential|unauthor|forbidden|401|403/i.test(message)) {
    return "That key was turned down. Open Connect and sign in again.";
  }
  if (/quota|credit|billing|insufficient|402|429/i.test(message)) {
    return "Your provider is out of credit, or you've hit a rate limit.";
  }
  return message;
}
