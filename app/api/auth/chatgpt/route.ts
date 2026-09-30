import {
  CHATGPT_CALLBACK_PATH,
  DYNAMIC_CLIENT_ID,
  isLoopbackHost,
  requestOrigin,
} from "@/lib/chatgpt";
import { ChatGptAuthError, exchangeCode, signOut } from "@/lib/chatgpt-session";
import { chatGptOwner } from "@/lib/owner";
import { startSession } from "@/lib/session";

type ExchangeBody = Partial<{
  code: string;
  verifier: string;
  nonce: string;
  clientId: string;
}>;

/**
 * Which client may finish a sign-in here. A provisioned one, when this
 * deployment has been given one; otherwise only a client the user registered
 * from 127.0.0.1, which is the one place OpenAI's open-source flow is for.
 */
function allowedClient(requested: string | undefined, hostname: string) {
  const provisioned = process.env.OPENAI_OAUTH_CLIENT_ID;
  if (provisioned) return requested === provisioned ? provisioned : null;
  if (!isLoopbackHost(hostname)) return null;
  return requested && requested !== DYNAMIC_CLIENT_ID ? requested : null;
}

/** Trades the popup's code for tokens, which go into cookies and nowhere else. */
export async function POST(req: Request) {
  const { code, verifier, nonce, clientId } = ((await req.json().catch(() => ({}))) ??
    {}) as ExchangeBody;
  const { origin, hostname } = requestOrigin(req);

  const client = allowedClient(clientId, hostname);
  if (!client) {
    return Response.json({ error: "ChatGPT sign-in isn't set up here." }, { status: 400 });
  }
  if (!code || !verifier || !nonce) {
    return Response.json({ error: "That sign-in came back incomplete." }, { status: 400 });
  }

  try {
    const { account, subject } = await exchangeCode({
      code,
      verifier,
      nonce,
      clientId: client,
      redirectUri: `${origin}${CHATGPT_CALLBACK_PATH}`,
    });
    const owner = chatGptOwner(subject);
    if (owner) await startSession(owner);
    return Response.json({ account });
  } catch (error) {
    console.error("ChatGPT sign-in failed.", error);
    const message =
      error instanceof ChatGptAuthError
        ? error.message
        : "Couldn't finish signing in with ChatGPT.";
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function DELETE() {
  return Response.json({ revoked: await signOut() });
}
