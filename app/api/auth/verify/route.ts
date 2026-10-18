import { verifyProviderKey } from "@/lib/verify-key";
import { readJson as readBounded, RequestBodyError } from "@/lib/request-security";
import { providerLabel, type LlmProvider } from "@/lib/providers";

export async function POST(req: Request) {
  try {
    const { provider, apiKey } = ((await readBounded(req, 8192)) ?? {}) as Partial<{
      provider: LlmProvider;
      apiKey: string;
    }>;

    if (
      !provider ||
      !["openrouter", "openai", "anthropic"].includes(provider) ||
      typeof apiKey !== "string" ||
      !apiKey ||
      apiKey.length > 4096
    ) {
      return Response.json({ ok: false, error: "Paste a key first." });
    }

    const ok = await verifyProviderKey(provider, apiKey);
    return Response.json({
      ok,
      ...(ok ? {} : { error: `${providerLabel(provider)} couldn't verify that key.` }),
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
