import { frontendTools } from "@assistant-ui/ai-sdk";
import {
  convertToModelMessages,
  generateId,
  isStepCount,
  streamText,
  tool,
  type JSONSchema7,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { isThreadId, saveMessages } from "@/lib/db";
import { createModel, llmErrorMessage, readLlmRequest } from "@/lib/llm";
import { chatPrompt } from "@/lib/prompts";
import { fetchReadablePage } from "@/lib/resume/fetch-page";
import { readViewer } from "@/lib/session";

export const maxDuration = 60;

const SOURCE_NOTE =
  "GitHub profiles and repositories are read through the API and come back clean. LinkedIn cannot be read at all. If a fetch fails, the result says why — pass that reason on rather than inventing one.";

export async function POST(req: Request) {
  const { apiKey, provider, model } = readLlmRequest(req);
  if (!apiKey) {
    return Response.json({ error: "Connect a provider to send a message." }, { status: 401 });
  }

  const {
    id,
    threadId,
    messages,
    tools,
    doc,
    sourceText,
  }: {
    id?: string;
    threadId?: string;
    messages?: UIMessage[];
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
    doc?: unknown;
    sourceText?: unknown;
  } = await req.json();

  if (!Array.isArray(messages)) {
    return Response.json({ error: "No messages sent." }, { status: 400 });
  }

  // Read now rather than in onFinish, which runs once the response is already
  // on its way out and no longer has a request to read cookies from.
  const viewer = await readViewer();

  const llm = createModel({
    apiKey,
    provider,
    model,
    sessionId: id?.slice(0, 256),
  });

  const result = streamText({
    model: llm.model,
    messages: await convertToModelMessages(messages),
    instructions: chatPrompt({ doc, sourceText }),
    abortSignal: req.signal,
    // Frontend tools have no execute, so they end the loop on their own. The
    // budget is for chained server tools: search, then fetch each good hit.
    stopWhen: isStepCount(8),
    temperature: 0,
    timeout: { totalMs: 55_000, toolMs: 25_000 },
    tools: {
      ...frontendTools(tools ?? {}),
      // Every provider runs its own search, so there is nothing here to build.
      web_search: llm.search,
      fetch_url: tool({
        description: `Read any public page as text: a GitHub profile or repository, a personal site, a portfolio, a job post. This is how you look someone up. What comes back is material to work from — apply it with the editing tools. ${SOURCE_NOTE}`,
        inputSchema: z.object({
          url: z.url().describe("Absolute http(s) URL of the page to read."),
        }),
        execute: async ({ url }, { abortSignal }) => fetchReadablePage(url, abortSignal),
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    onError: llmErrorMessage,
    originalMessages: messages,
    // Without this the reply is stored with an empty id, because the SDK only
    // infers one when the last original message is itself an assistant's. Two
    // of those in a thread are indistinguishable to the runtime's history, so
    // reopening it broke the chain and every turn re-parented to the root —
    // which is what turned a conversation into a row of branches.
    generateMessageId: generateId,
    onFinish: ({ messages: history }) => {
      if (!isThreadId(threadId)) return;
      // The same bar the browser uses to give a thread its URL. A turn that
      // died before the model said anything would otherwise leave a row behind
      // that nothing links to and nobody can reach.
      const answered = history.some(
        (message) =>
          message.role === "assistant" && message.parts.some((part) => part.type !== "step-start"),
      );
      if (!answered) return;
      // Nothing downstream can retry this, so a failure has to at least be
      // findable — silently losing the turn is how this went unnoticed before.
      void saveMessages(threadId, history, viewer).catch((error: unknown) => {
        console.error(`Couldn't save thread ${threadId}.`, error);
      });
    },
  });
}
