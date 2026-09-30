import { isLoopbackHost, requestOrigin, type ChatGptAvailability } from "@/lib/chatgpt";

function chatGpt(hostname: string): ChatGptAvailability {
  const clientId = process.env.OPENAI_OAUTH_CLIENT_ID;
  if (clientId) return { clientId };
  // OpenAI's open-source flow calls back to 127.0.0.1 and nowhere else, so it
  // only works on a copy running there. `localhost` is the same machine but
  // not the same origin, and the popup can't report back across that line.
  if (isLoopbackHost(hostname)) return { clientId: null };
  return hostname === "localhost" ? "loopback" : null;
}

export async function GET(req: Request) {
  return Response.json({
    configured: Boolean(process.env.OPENROUTER_API_KEY),
    chatgpt: chatGpt(requestOrigin(req).hostname),
  });
}
