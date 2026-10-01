import type { LanguageModelMiddleware } from "ai";

/**
 * The ChatGPT plan route is the public Responses API with a narrower
 * contract. These are the two places that contract is kept — the middleware
 * for what the SDK decides, the fetch for what reaches the wire — so no
 * caller has to know it's talking to a plan rather than a key.
 *
 * https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
 */

/** Function tools have to arrive grouped under a namespace on this route. */
const NAMESPACE = {
  name: "dearcv",
  description: "Edit the resume open in DearCV, and read public pages to write it from.",
};

export const chatGptPlanMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ params }) => ({
    ...params,
    // Sampling knobs are refused outright rather than ignored.
    temperature: undefined,
    topP: undefined,
    maxOutputTokens: undefined,
    providerOptions: {
      ...params.providerOptions,
      openai: {
        ...params.providerOptions?.openai,
        // Nothing is kept server-side, so the SDK has to resend history in full
        // — reasoning included, encrypted — instead of pointing at stored ids.
        store: false,
        // Explicit system items are rejected; developer messages are the way in.
        systemMessageMode: "developer",
        reasoningEffort: "low",
      },
    },
    tools: params.tools?.map((tool) =>
      tool.type === "function"
        ? {
            ...tool,
            providerOptions: {
              ...tool.providerOptions,
              openai: { ...tool.providerOptions?.openai, namespace: NAMESPACE },
            },
          }
        : tool,
    ),
  }),
};

const UNSUPPORTED_FIELDS = [
  "background",
  "conversation",
  "max_output_tokens",
  "max_tool_calls",
  "metadata",
  "moderation",
  "multi_agent",
  "previous_response_id",
  "prompt",
  "prompt_cache_retention",
  "safety_identifier",
  "service_tier",
  "temperature",
  "top_logprobs",
  "top_p",
  "truncation",
  "user",
];

const ERROR_STATUS: Record<string, number> = {
  subscription_sharing_usage_limit_exceeded: 429,
  subscription_sharing_user_not_eligible: 403,
  subscription_sharing_usage_unavailable: 503,
  subscription_sharing_user_unavailable: 503,
};

const TERMINAL_EVENTS = new Set([
  "response.completed",
  "response.incomplete",
  "response.failed",
  "error",
]);

type ResponsesEvent = {
  type?: string;
  code?: string;
  message?: string;
  output_index?: number;
  item?: unknown;
  response?: { output?: unknown[]; error?: { code?: string; message?: string } | null };
};

/**
 * The route only streams. A caller that asked for one JSON body — structured
 * output, say — gets the finished response the stream closes on, which is the
 * same object the non-streaming endpoint would have returned. Except that on
 * this route the closing event arrives with its output emptied: what was said
 * only ever went by as items along the way, so the output is put back from
 * those. Without it a transcription came back as nothing at all.
 */
async function settle(res: Response) {
  let terminal: ResponsesEvent | undefined;
  const items: unknown[] = [];
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const event = JSON.parse(line.slice(5)) as ResponsesEvent;
      if (event.type === "response.output_item.done" && event.item) {
        items[event.output_index ?? items.length] = event.item;
      }
      if (event.type && TERMINAL_EVENTS.has(event.type)) terminal = event;
    } catch {
      // A keep-alive or a partial line; neither is the end of the response.
    }
  }

  if (terminal?.type === "response.completed" || terminal?.type === "response.incomplete") {
    const response = terminal.response ?? {};
    const output = response.output?.length ? response.output : items.filter(Boolean);
    return Response.json({ ...response, output });
  }
  const error = terminal?.response?.error ??
    (terminal?.type === "error" ? { code: terminal.code, message: terminal.message } : null) ?? {
      message: "ChatGPT ended the response without finishing it.",
    };
  return Response.json({ error }, { status: ERROR_STATUS[error.code ?? ""] ?? 502 });
}

/** Models this deployment has seen refuse hosted search on a plan. */
const searchRefused = new Set<string>();

const withoutSearch = (tools: { type?: string }[] | undefined) =>
  tools?.filter((tool) => tool.type !== "web_search");

export const chatGptPlanFetch: typeof fetch = async (input, init) => {
  if (typeof init?.body !== "string") return fetch(input, init);

  const body = JSON.parse(init.body) as Record<string, unknown> & {
    model?: string;
    stream?: boolean;
    tools?: { type?: string }[];
  };
  const streamed = body.stream === true;
  for (const field of UNSUPPORTED_FIELDS) delete body[field];
  body.store = false;
  body.stream = true;
  if (body.model && searchRefused.has(body.model)) body.tools = withoutSearch(body.tools);

  const send = () => fetch(input, { ...init, body: JSON.stringify(body) });
  let res = await send();

  // Search is "subject to model and account policy". When the policy says no,
  // the turn is still worth taking — just without it.
  const searched = body.tools?.some((tool) => tool.type === "web_search");
  if (res.status === 400 && searched) {
    const detail = await res.clone().text();
    if (
      detail.includes("subscription_sharing_unsupported_capability") &&
      /web_search|tools/.test(detail)
    ) {
      if (body.model) searchRefused.add(body.model);
      body.tools = withoutSearch(body.tools);
      res = await send();
    }
  }

  return streamed || !res.ok ? res : settle(res);
};

const PLAN_ERRORS: [RegExp, string][] = [
  [
    /subscription_sharing_usage_limit_exceeded/,
    "You've reached the limit on your ChatGPT plan for DearCV. Manage it at chatgpt.com/settings/usage.",
  ],
  [
    /subscription_sharing_user_not_eligible/,
    "This ChatGPT account can't use its plan in other apps. Paste a key instead.",
  ],
  [
    /subscription_sharing_(usage|user)_unavailable/,
    "ChatGPT couldn't check your plan just now. Try again in a moment.",
  ],
  [
    /subscription_sharing_invalid_user|chatpass_v2_/,
    "ChatGPT didn't accept the sign-in. Open Connect and sign in with ChatGPT again.",
  ],
];

/** The plan's own errors, which carry their meaning in a code rather than the message. */
export function chatGptPlanError(error: unknown) {
  const haystack = `${error instanceof Error ? error.message : String(error)} ${JSON.stringify(error) ?? ""}`;
  return PLAN_ERRORS.find(([pattern]) => pattern.test(haystack))?.[1] ?? null;
}
