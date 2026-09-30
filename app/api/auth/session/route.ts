import { readAccess } from "@/lib/chatgpt-session";
import { canOwn, chatGptOwner, resolveOwner } from "@/lib/owner";
import { readLlmRequest } from "@/lib/llm";
import { endSession, readViewer, startSession } from "@/lib/session";

/**
 * Trades a credential for a cookie saying who it belongs to. A pasted key
 * arrives in the same header the chat route takes it in, is used once against
 * the provider, and is never written down. A ChatGPT sign-in already named its
 * account when it was verified, so that one is read back out of its cookie.
 */
export async function POST(req: Request) {
  if (!canOwn()) return Response.json({ owner: null });

  // Already known here, so a reload doesn't cost a round trip to OpenRouter.
  const current = await readViewer();
  if (current) return Response.json({ owner: current });

  if (req.headers.get("x-resume-auth") === "chatgpt") {
    const owner = chatGptOwner((await readAccess())?.subject ?? "");
    if (owner) await startSession(owner);
    return Response.json({ owner });
  }

  const { apiKey, provider } = await readLlmRequest(req);
  // A key from the environment belongs to whoever is hosting, not to the person
  // in front of it, so it can't stand in for one of them.
  if (!apiKey || !req.headers.get("authorization")) {
    return Response.json({ owner: null });
  }

  const owner = await resolveOwner(provider, apiKey);
  if (owner) await startSession(owner);

  return Response.json({ owner });
}

export async function DELETE() {
  await endSession();
  return Response.json({ owner: null });
}
