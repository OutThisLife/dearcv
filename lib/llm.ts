import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapLanguageModel } from "ai";
import { chatGptPlanError, chatGptPlanFetch, chatGptPlanMiddleware } from "@/lib/chatgpt-plan";
import { readAccess } from "@/lib/chatgpt-session";
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

/**
 * A ChatGPT sign-in never hands its token to the page, so the request only
 * says which credential to use; the token itself comes out of the sealed
 * cookie. Its model was read from the account's own catalog at sign-in.
 */
export async function readLlmRequest(req: Request) {
  if (req.headers.get("x-resume-auth") === "chatgpt") {
    const access = await readAccess();
    const live = access && access.expiresAt > Date.now();
    return {
      apiKey: live ? access.accessToken : "",
      provider: "openai" as LlmProvider,
      model: access?.model ?? "",
      plan: true,
    };
  }

  const headerKey = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const apiKey = headerKey || process.env.OPENROUTER_API_KEY || "";
  const requested = req.headers.get("x-resume-provider") || process.env.RESUME_PROVIDER || "";
  const provider = isProvider(requested) ? requested : "openrouter";
  const model = process.env.RESUME_MODEL || DEFAULT_MODEL[provider];

  return { apiKey, provider, model, plan: false };
}

/**
 * `search` is whichever web search the provider runs itself. All three ship
 * one, they execute it on their side, and it bills to the user's own key —
 * or, signed in with ChatGPT, to their plan.
 */
export function createModel(input: {
  apiKey: string;
  provider: LlmProvider;
  model: string;
  plan?: boolean;
  sessionId?: string;
}) {
  if (input.provider === "openai") {
    const openai = createOpenAI({
      apiKey: input.apiKey,
      fetch: input.plan ? chatGptPlanFetch : undefined,
    });
    const model = openai.responses(input.model);
    return {
      model: input.plan ? wrapLanguageModel({ model, middleware: chatGptPlanMiddleware }) : model,
      search: openai.tools.webSearch({ searchContextSize: "low" }),
      // A ChatGPT plan reaches only the chat models, not the image API.
      image: input.plan
        ? null
        : (transparent: boolean) => ({
            // GPT Image 2 can't leave the background see-through; 1 can.
            model: openai.image(
              process.env.RESUME_IMAGE_MODEL || (transparent ? "gpt-image-1" : "gpt-image-2"),
            ),
            providerOptions: {
              openai: { quality: "medium", background: transparent ? "transparent" : "opaque" },
            },
            // GPT Image draws three sizes: square, landscape, portrait.
            sizeOf: (aspect: string) => {
              const [w = 1, h = 1] = aspect.split(":").map(Number);
              return w === h ? "1024x1024" : w > h ? "1536x1024" : "1024x1536";
            },
          }),
    };
  }
  if (input.provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey: input.apiKey });
    return {
      model: anthropic(input.model),
      search: anthropic.tools.webSearch_20250305({ maxUses: 3 }),
      // Anthropic makes no pictures.
      image: null,
    };
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
    search: openrouter.tools.webSearch({ engine: "auto", maxResults: 5 }),
    // Billed to their own key like everything else. A sticker needs a
    // see-through background, which only OpenAI's image models leave; Gemini
    // paints the rest well and takes any shape.
    image: (transparent: boolean) => ({
      model: openrouter.imageModel(
        process.env.RESUME_IMAGE_MODEL ||
          (transparent ? "openai/gpt-image-2.5-flare" : "google/gemini-3.1-flash-image"),
      ),
      providerOptions: {
        openrouter: transparent ? { background: "transparent", quality: "medium" } : {},
      },
    }),
  };
}

export function llmErrorMessage(error: unknown) {
  const plan = chatGptPlanError(error);
  if (plan) return plan;

  const message = error instanceof Error ? error.message : String(error);
  if (/auth|api[- ]?key|credential|unauthor|forbidden|401|403/i.test(message)) {
    return "That key was turned down. Open Connect and sign in again.";
  }
  if (/quota|credit|billing|insufficient|402|429/i.test(message)) {
    return "Your provider is out of credit, or you've hit a rate limit.";
  }
  return message;
}
