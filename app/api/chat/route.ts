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
import { findImages } from "@/lib/resume/find-images";
import { generateImageTool } from "@/lib/resume/generate-image";
import { readViewer } from "@/lib/session";
import { liftPictures, withoutPictures } from "@/lib/tool-pictures";

export const maxDuration = 120;

const SOURCE_NOTE =
  "GitHub profiles and repositories are read through the API and come back clean. LinkedIn cannot be read at all. If a fetch fails, the result says why — pass that reason on rather than inventing one.";

export async function POST(req: Request) {
  const { apiKey, provider, model, plan } = await readLlmRequest(req);
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
    comment,
    comments,
    undone,
    layout,
  }: {
    id?: string;
    threadId?: string;
    messages?: UIMessage[];
    tools?: Record<string, { description?: string; parameters: JSONSchema7 }>;
    doc?: unknown;
    sourceText?: unknown;
    /** Where on the page, for a comment's own conversation. */
    comment?: unknown;
    /** The page's open comments, told to the chat. */
    comments?: unknown;
    /** The steps they stepped back past, while looking at an earlier one. */
    undone?: unknown;
    /** Where every part sits on the page as last drawn, in points. */
    layout?: unknown;
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
    plan,
    sessionId: id?.slice(0, 256),
  });

  const allTools = {
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
    find_images: findImages,
    generate_image: generateImageTool(llm.image),
  };

  const result = streamText({
    model: llm.model,
    // Only the newest look at the page goes back to the model, and every
    // picture rides in a message of its own: most providers take images from
    // the user but not inside a tool's result.
    messages: liftPictures(
      await convertToModelMessages(withoutPictures(messages, true), { tools: allTools }),
    ),
    instructions: chatPrompt({ doc, sourceText, comment, comments, undone, layout }),
    abortSignal: req.signal,
    // Frontend tools have no execute, so they end the loop on their own. The
    // budget is for chained server tools: search, then fetch each good hit.
    stopWhen: isStepCount(8),
    temperature: 0,
    // A made picture alone can take most of a minute.
    timeout: { totalMs: 115_000, toolMs: 75_000 },
    tools: allTools,
    // Pictures the model is handed mid-turn — one it just made — go the same way.
    prepareStep: ({ messages: step }) => ({ messages: liftPictures(step) }),
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
      void saveMessages(threadId, withoutPictures(history, false), viewer).catch(
        (error: unknown) => {
          console.error(`Couldn't save thread ${threadId}.`, error);
        },
      );
    },
  });
}
