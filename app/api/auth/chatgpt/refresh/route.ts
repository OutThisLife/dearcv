import { ChatGptAuthError, refreshAccess } from "@/lib/chatgpt-session";

/** Renews the hour-long access token from the cookie holding the refresh token. */
export async function POST() {
  try {
    const { account } = await refreshAccess();
    return Response.json({ account });
  } catch (error) {
    const signedOut = error instanceof ChatGptAuthError && error.signedOut;
    if (!signedOut) console.error("ChatGPT refresh failed.", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Couldn't renew the sign-in.", signedOut },
      { status: signedOut ? 401 : 502 },
    );
  }
}
