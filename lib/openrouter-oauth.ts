export const OAUTH_MESSAGE = "dearcv:openrouter-oauth";

const AUTH_URL = "https://openrouter.ai/auth";
const KEY_URL = "https://openrouter.ai/api/v1/auth/keys";

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function s256(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/**
 * OpenRouter's PKCE flow, run in a popup. A full-page redirect would work too,
 * but it would throw away the uploaded PDF's blob URL and the chat in progress.
 */
export async function connectOpenRouter(): Promise<string> {
  // Must open synchronously with the click or the popup blocker eats it.
  const popup = window.open("", "openrouter-oauth", "width=520,height=720");
  if (!popup) throw new Error("Allow popups for this site, then try again.");

  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  popup.location.href = `${AUTH_URL}?${new URLSearchParams({
    callback_url: `${window.location.origin}/auth/callback`,
    code_challenge: await s256(verifier),
    code_challenge_method: "S256",
  })}`;

  const code = await waitForCode(popup);

  const res = await fetch(KEY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
  });
  if (!res.ok) throw new Error("OpenRouter wouldn't hand over a key.");

  const { key } = (await res.json()) as { key?: string };
  if (!key) throw new Error("OpenRouter wouldn't hand over a key.");
  return key;
}

function waitForCode(popup: Window) {
  return new Promise<string>((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
      fn();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== OAUTH_MESSAGE) return;
      const code = event.data.code as string | undefined;
      finish(() => (code ? resolve(code) : reject(new Error("No code came back."))));
    };

    // The callback closes itself right after posting, so give the message a
    // beat to land before treating a closed window as a cancel.
    const poll = window.setInterval(() => {
      if (!popup.closed) return;
      window.setTimeout(() => {
        if (!settled) finish(() => reject(new Error("Sign-in was cancelled.")));
      }, 500);
    }, 400);

    window.addEventListener("message", onMessage);
  });
}
