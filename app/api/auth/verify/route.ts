import { providerLabel, type LlmProvider } from "@/lib/providers";

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

/** Cheapest authenticated GET each provider offers, used purely as a key check. */
const PROBES: Record<
  LlmProvider,
  { url: string; headers: (key: string) => Record<string, string> }
> = {
  openrouter: { url: "https://openrouter.ai/api/v1/key", headers: bearer },
  openai: { url: "https://api.openai.com/v1/models", headers: bearer },
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
};

export async function POST(req: Request) {
  const { provider, apiKey } = (await req.json()) as Partial<{
    provider: LlmProvider;
    apiKey: string;
  }>;

  const probe = provider && PROBES[provider];
  if (!probe || !apiKey) {
    return Response.json({ ok: false, error: "Paste a key first." });
  }

  const label = providerLabel(provider);
  try {
    const res = await fetch(probe.url, {
      headers: probe.headers(apiKey),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return Response.json({ ok: true });

    return Response.json({
      ok: false,
      error:
        res.status === 401 || res.status === 403
          ? `${label} didn't recognize that key.`
          : `${label} couldn't check that key right now. Try again in a moment.`,
    });
  } catch {
    return Response.json({ ok: false, error: `Couldn't reach ${label}.` });
  }
}
