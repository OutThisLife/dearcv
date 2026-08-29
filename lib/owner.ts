import { createHmac } from "node:crypto";
import type { LlmProvider } from "@/lib/providers";

const secret = process.env.AUTH_SECRET ?? "";

/**
 * Ownership needs a secret to sign with. Without one it stays off and every
 * thread is reachable by its link, which is how this worked before — better
 * than pretending to lock something with a key anyone could recompute.
 */
export const canOwn = () => secret.length > 0;

/**
 * Keyed rather than plain: an OpenRouter account id is short and guessable
 * enough that a leaked database shouldn't be a lookup table for who owns what.
 */
const fingerprint = (identity: string) =>
  createHmac("sha256", secret).update(identity).digest("hex");

/** The account behind a key, which outlives any single key it issues. */
async function openRouterAccount(apiKey: string) {
  const res = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as { data?: { creator_user_id?: string | null } };
  return body.data?.creator_user_id ?? null;
}

/**
 * Who a key speaks for. Signing in with OpenRouter mints a brand new key every
 * time, so a thread tied to the key itself would be lost on the next sign-in —
 * it's tied to the account instead, which also means pasting the same key on
 * another device brings your work with it.
 */
export async function resolveOwner(provider: LlmProvider, apiKey: string) {
  if (!canOwn() || !apiKey) return null;

  if (provider === "openrouter") {
    const account = await openRouterAccount(apiKey);
    return account ? fingerprint(`openrouter:${account}`) : null;
  }

  // OpenAI and Anthropic publish no account id, so here the key is the
  // identity. Rotating one starts a fresh set of threads.
  return fingerprint(`${provider}:${apiKey}`);
}
