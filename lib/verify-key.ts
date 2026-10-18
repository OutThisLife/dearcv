import type { LlmProvider } from "./providers";

export async function verifyProviderKey(provider: LlmProvider, apiKey: string): Promise<boolean> {
  if (!apiKey || apiKey.length > 4096) return false;
  const endpoints = {
    openrouter: "https://openrouter.ai/api/v1/key",
    openai: "https://api.openai.com/v1/models",
    anthropic: "https://api.anthropic.com/v1/models",
  };
  if (!Object.hasOwn(endpoints, provider)) return false;
  try {
    const headers: Record<string, string> =
      provider === "anthropic"
        ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
        : { authorization: `Bearer ${apiKey}` };
    const res = await fetch(endpoints[provider], { headers, signal: AbortSignal.timeout(10_000) });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}
