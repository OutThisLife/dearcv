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
    // A BroadcastChannel rather than window.opener: OpenRouter's sign-in hops
    // through pages that cut the popup off from its opener, so a postMessage
    // from the callback never arrives. Same-origin tabs still share a channel.
    const channel = new BroadcastChannel(OAUTH_MESSAGE);
    let settled = false;
    let cancel: number | undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      channel.close();
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(poll);
      window.clearTimeout(cancel);
      fn();
    };

    const take = (data: unknown) => {
      const message = data as { source?: string; code?: string | null } | null;
      if (message?.source !== OAUTH_MESSAGE) return;
      finish(() => (message.code ? resolve(message.code) : reject(new Error("No code came back."))));
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin) take(event.data);
    };
    channel.onmessage = (event) => take(event.data);

    // Once the opener link is cut, popup.closed reads true while the popup is
    // still open. Only call it a cancel once this window has focus again, with
    // a beat for the callback's message to land.
    const onFocus = () => {
      if (!popup.closed || settled) return;
      window.clearTimeout(cancel);
      cancel = window.setTimeout(
        () => finish(() => reject(new Error("Sign-in was cancelled."))),
        1500,
      );
    };
    const poll = window.setInterval(() => {
      if (popup.closed && document.hasFocus()) onFocus();
    }, 400);

    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
  });
}
