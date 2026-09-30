import {
  CHATGPT_AUTHORIZE_URL,
  CHATGPT_CALLBACK_PATH,
  CHATGPT_CHANNEL,
  CHATGPT_RESOURCE,
  CHATGPT_SCOPES,
  DYNAMIC_CLIENT_ID,
  type ChatGptAccount,
  type ChatGptCallback,
} from "@/lib/chatgpt";

const REGISTRATION_KEY = "dearcv.chatgpt";
const TIMEOUT = 10 * 60_000;

/**
 * What this browser remembers about its ChatGPT registration. None of it is a
 * credential — the tokens are in a cookie script can't read. The host id names
 * this install to OpenAI; the client id is the one OpenAI issued the account
 * the first time, which every later sign-in has to reuse.
 */
type Registration = {
  hostId: string;
  clientId?: string;
  email?: string | null;
  welcomed?: boolean;
};

function readRegistration(): Registration {
  try {
    const stored = JSON.parse(localStorage.getItem(REGISTRATION_KEY) ?? "null") as Registration;
    if (stored?.hostId) return stored;
  } catch {
    // Unreadable is the same as absent.
  }
  // Chosen and kept before the first sign-in, as OpenAI asks.
  const fresh = { hostId: `urn:uuid:${crypto.randomUUID()}` };
  localStorage.setItem(REGISTRATION_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveRegistration(next: Registration) {
  localStorage.setItem(REGISTRATION_KEY, JSON.stringify(next));
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const randomToken = (size = 32) => base64url(crypto.getRandomValues(new Uint8Array(size)));

async function s256(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/**
 * OpenAI's sign-in page cuts the popup off from the window that opened it
 * (Cross-Origin-Opener-Policy), so the callback can't reach back through
 * `window.opener` and a closed popup can't be told from an open one. The two
 * share an origin, though, and so a broadcast channel.
 */
function waitForCallback(state: string, signal: AbortSignal) {
  return new Promise<ChatGptCallback>((resolve, reject) => {
    const channel = new BroadcastChannel(CHATGPT_CHANNEL);
    const finish = () => {
      channel.close();
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      finish();
      reject(new DOMException("Sign-in was cancelled.", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      finish();
      reject(new Error("Sign-in timed out. Try again."));
    }, TIMEOUT);

    channel.onmessage = (event: MessageEvent<ChatGptCallback>) => {
      // A stale popup from an earlier attempt answers with its own state.
      if (event.data?.source !== CHATGPT_CHANNEL || event.data.state !== state) return;
      finish();
      resolve(event.data);
    };
    signal.addEventListener("abort", onAbort);
  });
}

/**
 * Sign in with ChatGPT, run in a popup so the uploaded PDF and the chat in
 * progress survive it. The code comes back here; the exchange happens on the
 * server, which keeps the tokens and returns only who signed in.
 *
 * `provisioned` is the client id this deployment was issued by OpenAI, if any.
 * Without one, the first sign-in registers a client for the account.
 */
export async function signInWithChatGpt(provisioned: string | null, signal: AbortSignal) {
  // Must open synchronously with the click or the popup blocker eats it.
  const popup = window.open("", "chatgpt-oauth", "width=520,height=720");
  if (!popup) throw new Error("Allow popups for this site, then try again.");

  try {
    const registration = readRegistration();
    const clientId = provisioned ?? registration.clientId ?? DYNAMIC_CLIENT_ID;
    const registering = clientId === DYNAMIC_CLIENT_ID;
    const verifier = randomToken();
    const state = randomToken(16);
    const nonce = randomToken(16);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: `${window.location.origin}${CHATGPT_CALLBACK_PATH}`,
      scope: CHATGPT_SCOPES,
      resource: CHATGPT_RESOURCE,
      state,
      nonce,
      code_challenge: await s256(verifier),
      code_challenge_method: "S256",
    });
    if (!provisioned) params.set("ext_agent_host_id", registration.hostId);
    if (registering) params.set("agent_name_hint", "DearCV");
    else if (registration.email) params.set("login_hint", registration.email);
    popup.location.href = `${CHATGPT_AUTHORIZE_URL}?${params}`;

    const callback = await waitForCallback(state, signal);
    if (callback.error) {
      throw new Error(
        callback.error === "access_denied"
          ? "ChatGPT sign-in was declined."
          : `ChatGPT couldn't sign you in (${callback.error}).`,
      );
    }
    // A new registration names its client in the callback; a returning one
    // keeps the client it already has and must not come back with another.
    const issued = registering ? callback.clientId : clientId;
    if (!callback.code || !issued || issued === DYNAMIC_CLIENT_ID) {
      throw new Error("ChatGPT sign-in came back incomplete. Try again.");
    }
    if (!registering && callback.clientId && callback.clientId !== clientId) {
      throw new Error("That sign-in came back for a different registration. Try again.");
    }

    const res = await fetch("/api/auth/chatgpt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: callback.code, verifier, nonce, clientId: issued }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      account?: ChatGptAccount;
      error?: string;
    };
    if (!res.ok || !body.account) throw new Error(body.error ?? "Couldn't finish signing in.");

    const firstTime = !registration.welcomed;
    saveRegistration({
      ...registration,
      clientId: provisioned ? registration.clientId : issued,
      email: body.account.email,
      welcomed: true,
    });
    return { account: body.account, firstTime };
  } catch (error) {
    popup.close();
    throw error;
  }
}

/** Ends the session on OpenAI's side and clears the cookies. Local sign-out never waits on it. */
export function signOutOfChatGpt() {
  return fetch("/api/auth/chatgpt", { method: "DELETE" }).catch(() => undefined);
}

let renewing: Promise<ChatGptAccount | null> | null = null;

/**
 * Renews the hour-long token when it's close to lapsing. One renewal at a
 * time, across tabs too: the refresh token rotates on use, and two renewals
 * racing would spend it twice and sign everyone out.
 *
 * Resolves to the renewed account, `null` once the sign-in is gone for good,
 * or throws when renewal merely failed this time.
 */
export function renewChatGpt(): Promise<ChatGptAccount | null> {
  renewing ??= (async () => {
    const run = async () => {
      const res = await fetch("/api/auth/chatgpt/refresh", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        account?: ChatGptAccount;
        signedOut?: boolean;
        error?: string;
      };
      if (body.signedOut) return null;
      if (!res.ok || !body.account) throw new Error(body.error ?? "Couldn't renew the sign-in.");
      return body.account;
    };
    return navigator.locks ? navigator.locks.request("dearcv.chatgpt.renew", run) : run();
  })().finally(() => {
    renewing = null;
  });
  return renewing;
}
