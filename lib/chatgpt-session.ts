import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, EncryptJWT, jwtDecrypt, jwtVerify } from "jose";
import { cookies } from "next/headers";
import {
  CHATGPT_ISSUER,
  CHATGPT_PLAN_SCOPE,
  CHATGPT_RESOURCE,
  type ChatGptAccount,
} from "@/lib/chatgpt";

const TOKEN_URL = `${CHATGPT_ISSUER}/api/accounts/oauth/token`;
const REVOKE_URL = `${CHATGPT_ISSUER}/api/accounts/oauth/revoke`;
const JWKS = createRemoteJWKSet(new URL(`${CHATGPT_ISSUER}/.well-known/jwks.json`));

const ACCESS_COOKIE = "dearcv.chatgpt";
const REFRESH_COOKIE = "dearcv.chatgpt.refresh";
/** The refresh token only ever travels to the routes that spend it. */
const REFRESH_PATH = "/api/auth/chatgpt";
/** A refresh token lives 30 days, and each refresh hands back a fresh one. */
const MAX_AGE = 60 * 60 * 24 * 30;

/**
 * OpenAI asks that these tokens stay out of browser storage, so they live in
 * cookies the page's script can't read, sealed with a key derived from
 * AUTH_SECRET. Without one there is still a key, just not one that survives a
 * restart — fine on a laptop, where signing in again is a click.
 */
const sealKey = createHash("sha256")
  .update(`dearcv.chatgpt:${process.env.AUTH_SECRET || randomBytes(32).toString("hex")}`)
  .digest();

type AccessRecord = {
  accessToken: string;
  expiresAt: number;
  clientId: string;
  subject: string;
  email: string | null;
  model: string;
};

type RefreshRecord = { refreshToken: string; clientId: string };

async function seal(payload: Record<string, unknown>) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .encrypt(sealKey);
}

async function unseal<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    return (await jwtDecrypt(token, sealKey)).payload as T;
  } catch {
    // Sealed under a key we no longer hold, or tampered with. Either way it's
    // a signed-out visitor, not an error.
    return null;
  }
}

const cookieOptions = (path: string) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path,
  maxAge: MAX_AGE,
});

export async function readAccess() {
  return unseal<AccessRecord>((await cookies()).get(ACCESS_COOKIE)?.value);
}

async function readRefresh() {
  return unseal<RefreshRecord>((await cookies()).get(REFRESH_COOKIE)?.value);
}

/** A provisioned client may be confidential; a registered one never is. */
function clientAuth(clientId: string): Record<string, string> {
  const secret = process.env.OPENAI_OAUTH_CLIENT_SECRET;
  return secret && clientId === process.env.OPENAI_OAUTH_CLIENT_ID
    ? { client_id: clientId, client_secret: secret }
    : { client_id: clientId };
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
};

export class ChatGptAuthError extends Error {
  constructor(
    message: string,
    /** The refresh token is spent or revoked; only a new sign-in fixes it. */
    readonly signedOut = false,
  ) {
    super(message);
  }
}

const TERMINAL_REFRESH_ERRORS = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
]);

async function tokenRequest(clientId: string, grant: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...grant, ...clientAuth(clientId), resource: CHATGPT_RESOURCE }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    const code = body.error ?? `http_${res.status}`;
    throw new ChatGptAuthError(
      body.error_description || `OpenAI turned down the sign-in (${code}).`,
      grant.grant_type === "refresh_token" && TERMINAL_REFRESH_ERRORS.has(code),
    );
  }
  return body;
}

/**
 * The first model the account lists as a small one, else whatever it lists
 * first. The catalog belongs to the account, so it's read with the account's
 * own token rather than hardcoded. RESUME_MODEL still wins for self-hosters.
 */
async function pickModel(accessToken: string) {
  if (process.env.RESUME_MODEL) return process.env.RESUME_MODEL;

  const res = await fetch(`${CHATGPT_RESOURCE}/models`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    models?: { slug?: string; visibility?: string }[];
  };
  const slugs = (body.models ?? [])
    .filter((model) => model.visibility === "list" && model.slug)
    .map((model) => model.slug as string);
  const small = slugs.find((slug) => /-(luna|mini)\b/.test(slug));
  const model = small ?? slugs[0];
  if (!model) throw new ChatGptAuthError("That ChatGPT account doesn't list any models to use.");
  return model;
}

async function persist(
  tokens: TokenResponse,
  identity: Omit<AccessRecord, "accessToken" | "expiresAt" | "model">,
  refreshFallback?: string,
) {
  const granted = new Set((tokens.scope ?? "").split(" "));
  if (!granted.has(CHATGPT_PLAN_SCOPE)) {
    throw new ChatGptAuthError(
      "ChatGPT signed you in but didn't allow DearCV to use your plan. Sign in again and allow it, or paste a key.",
    );
  }

  const record: AccessRecord = {
    ...identity,
    accessToken: tokens.access_token,
    // A minute early, so a request never sets off with a token about to lapse.
    expiresAt: Date.now() + ((tokens.expires_in ?? 3600) - 60) * 1000,
    model: await pickModel(tokens.access_token),
  };
  const refreshToken = tokens.refresh_token ?? refreshFallback;

  const jar = await cookies();
  jar.set(ACCESS_COOKIE, await seal(record), cookieOptions("/"));
  if (refreshToken) {
    jar.set(
      REFRESH_COOKIE,
      await seal({ refreshToken, clientId: record.clientId } satisfies RefreshRecord),
      cookieOptions(REFRESH_PATH),
    );
  }

  return {
    account: { email: record.email, clientId: record.clientId, expiresAt: record.expiresAt },
    subject: record.subject,
  } satisfies { account: ChatGptAccount; subject: string };
}

/** Finishes a sign-in: trades the code, checks who it is, and keeps the result. */
export async function exchangeCode(input: {
  code: string;
  verifier: string;
  nonce: string;
  redirectUri: string;
  clientId: string;
}) {
  const tokens = await tokenRequest(input.clientId, {
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier,
    redirect_uri: input.redirectUri,
  });
  if (!tokens.id_token) throw new ChatGptAuthError("OpenAI didn't say who signed in.");

  const { payload } = await jwtVerify(tokens.id_token, JWKS, {
    issuer: CHATGPT_ISSUER,
    audience: input.clientId,
  });
  if (payload.nonce !== input.nonce || typeof payload.sub !== "string") {
    throw new ChatGptAuthError("That sign-in didn't match the one we started. Try again.");
  }

  return persist(tokens, {
    clientId: input.clientId,
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
  });
}

/**
 * Renews the access token. Another tab may have just done it — the cookies are
 * shared — so a token with life left is kept rather than rotated again, which
 * would spend the refresh token the other tab is now holding.
 */
export async function refreshAccess() {
  const [access, refresh] = await Promise.all([readAccess(), readRefresh()]);
  if (!refresh) throw new ChatGptAuthError("Sign in with ChatGPT again.", true);
  if (access && access.expiresAt - Date.now() > 5 * 60_000) {
    return {
      account: { email: access.email, clientId: access.clientId, expiresAt: access.expiresAt },
      subject: access.subject,
    };
  }

  try {
    const tokens = await tokenRequest(refresh.clientId, {
      grant_type: "refresh_token",
      refresh_token: refresh.refreshToken,
    });
    return await persist(
      tokens,
      {
        clientId: refresh.clientId,
        subject: access?.subject ?? "",
        email: access?.email ?? null,
      },
      refresh.refreshToken,
    );
  } catch (error) {
    if (error instanceof ChatGptAuthError && error.signedOut) await clearCookies();
    throw error;
  }
}

async function clearCookies() {
  const jar = await cookies();
  jar.delete({ name: ACCESS_COOKIE, path: "/" });
  jar.delete({ name: REFRESH_COOKIE, path: REFRESH_PATH });
}

/**
 * Ends the renewable session on OpenAI's side before forgetting it here. A
 * revoke that doesn't land still signs out locally — the user can disconnect
 * DearCV from ChatGPT's settings — so this reports whether it was confirmed.
 */
export async function signOut() {
  const refresh = await readRefresh();
  await clearCookies();
  if (!refresh) return true;

  const res = await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: refresh.refreshToken,
      token_type_hint: "refresh_token",
      ...clientAuth(refresh.clientId),
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return Boolean(res?.ok);
}
