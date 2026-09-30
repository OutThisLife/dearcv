/**
 * Sign in with ChatGPT, spent against the user's own ChatGPT plan. Shared by
 * the popup, its callback page, and the routes that finish the exchange.
 *
 * https://developers.openai.com/siwc/token-sharing-open-source
 */

export const CHATGPT_ISSUER = "https://auth.openai.com";
export const CHATGPT_AUTHORIZE_URL = `${CHATGPT_ISSUER}/api/accounts/authorize`;
export const CHATGPT_RESOURCE = "https://api.openai.com/v1";
export const CHATGPT_SCOPES =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const CHATGPT_PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const CHATGPT_USAGE_URL = "https://chatgpt.com/settings/usage";

/**
 * Where OpenAI sends the browser back. Registered once per client, so it can
 * never move: an open-source client is bound to it at first sign-in, and a
 * provisioned one lists it as its callback.
 */
export const CHATGPT_CALLBACK_PATH = "/auth/chatgpt";

/**
 * Registers a fresh client on first sign-in. It is an entry point, never the
 * id to keep — the callback hands back the one issued for this account.
 */
export const DYNAMIC_CLIENT_ID = "dynamic_agent_client";

/** The callback page and the popup share an origin, and so a channel. */
export const CHATGPT_CHANNEL = "dearcv:chatgpt-oauth";

/**
 * What `/api/auth/status` says about signing in with ChatGPT here:
 * `null` — not offered; `"loopback"` — only from 127.0.0.1, which OpenAI's
 * open-source flow requires and `localhost` doesn't satisfy;
 * `{ clientId }` — offered, with a provisioned client id or none (register one).
 */
export type ChatGptAvailability = null | "loopback" | { clientId: string | null };

export type ChatGptCallback = {
  source: typeof CHATGPT_CHANNEL;
  code: string | null;
  state: string | null;
  clientId: string | null;
  error: string | null;
};

/** What the browser is told about a sign-in. The tokens themselves stay in the cookie. */
export type ChatGptAccount = {
  email: string | null;
  clientId: string;
  expiresAt: number;
};

export const isLoopbackHost = (hostname: string) => hostname === "127.0.0.1";

/**
 * The origin the browser actually used. `req.url` can't say: Next rebuilds it
 * from its own idea of the host, so a request to 127.0.0.1 reads as localhost,
 * and the callback has to match what the browser was sent to exactly.
 */
export function requestOrigin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  return new URL(`${proto}://${host}`);
}
