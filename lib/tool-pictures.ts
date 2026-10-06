import { isToolUIPart, type ModelMessage, type UIMessage } from "ai";

/**
 * A tool's answer with pictures in it, for the model to look at: the page as
 * it prints. Built as assistant-ui's own envelope, so the chat route unpacks
 * each picture into an image the model can see rather than base64 inside
 * some JSON, while anything showing the call only reads `value`.
 */
const KEY = "__aui_modelContent";

type Part = { type: "text"; text: string } | { type: "file"; data: string; mediaType: string };
type Envelope = { [KEY]: Part[]; value: unknown };

export type Picture = { base64: string; mediaType: string; caption?: string };

export function withPictures(value: unknown, text: string, pictures: Picture[]): Envelope {
  return {
    [KEY]: [
      { type: "text", text },
      ...pictures.flatMap((picture): Part[] => [
        ...(picture.caption ? [{ type: "text" as const, text: picture.caption }] : []),
        { type: "file", data: picture.base64, mediaType: picture.mediaType },
      ]),
    ],
    value,
  };
}

const isEnvelope = (output: unknown): output is Envelope =>
  Boolean(output && typeof output === "object" && Array.isArray((output as Envelope)[KEY]));

/** What a call answered, without the pictures riding along with it. */
export const valueOf = (output: unknown) => (isEnvelope(output) ? output.value : output);

const hasPicture = (output: unknown) =>
  isEnvelope(output) && output[KEY].some((part) => part.type === "file");

/** A made picture's bytes, which the browser has kept by the time anything is sent back. */
const hasBytes = (output: unknown) =>
  Boolean(
    output && typeof output === "object" && typeof (output as { data?: unknown }).data === "string",
  );

const GONE: Part = {
  type: "text",
  text: "(That picture is no longer attached. Look again to see the page as it is now.)",
};

/**
 * The conversation without its old pictures. Every turn sends the whole
 * conversation back, and a page seen three edits ago is both out of date and
 * the heaviest thing in it — so only the newest look rides along to the
 * model, and none is written down with the thread. A made picture's bytes go
 * every time: the browser has stored them, and the page shows them.
 */
export function withoutPictures<M extends UIMessage>(messages: M[], keepNewest: boolean): M[] {
  let newest: string | undefined;
  if (keepNewest) {
    for (const message of messages) {
      for (const part of message.parts) {
        if (isToolUIPart(part) && part.state === "output-available" && hasPicture(part.output)) {
          newest = part.toolCallId;
        }
      }
    }
  }

  const heavy = (part: UIMessage["parts"][number]) =>
    isToolUIPart(part) &&
    part.state === "output-available" &&
    ((hasPicture(part.output) && part.toolCallId !== newest) || hasBytes(part.output));

  return messages.map((message) => {
    if (!message.parts.some(heavy)) return message;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (!heavy(part) || !isToolUIPart(part)) return part;
        if (hasBytes(part.output)) {
          const { data: _data, ...rest } = part.output as Record<string, unknown>;
          return { ...part, output: rest };
        }
        const output = part.output as Envelope;
        return {
          ...part,
          output: {
            ...output,
            [KEY]: output[KEY].map((one) => (one.type === "file" ? GONE : one)),
          },
        };
      }),
    };
  });
}

/**
 * Pictures a tool answered with, moved out of its result into a message of
 * their own just after it. Not every provider takes an image inside a tool
 * result — OpenAI's chat completions, and most of what OpenRouter routes to,
 * only take text there — but every vision model takes one from the user.
 */
export function liftPictures(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role !== "tool") {
      out.push(message);
      continue;
    }
    const lifted: { type: "image"; image: string; mediaType: string }[] = [];
    const names: string[] = [];
    const content = message.content.map((part) => {
      if (part.type !== "tool-result" || part.output.type !== "content") return part;
      const value = part.output.value;
      const pictures = value.filter(
        (one) =>
          one.type === "file" && one.mediaType.startsWith("image/") && one.data.type === "data",
      );
      if (!pictures.length) return part;
      for (const one of pictures) {
        if (one.type !== "file" || one.data.type !== "data") continue;
        const data = one.data.data;
        lifted.push({
          type: "image",
          image:
            typeof data === "string"
              ? data
              : Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data).toString(
                  "base64",
                ),
          mediaType: one.mediaType,
        });
      }
      names.push(part.toolName);
      return {
        ...part,
        output: {
          type: "content" as const,
          value: [
            ...value.filter((one) => one.type === "text"),
            { type: "text" as const, text: "(The picture follows in the next message.)" },
          ],
        },
      };
    });
    out.push({ ...message, content } as ModelMessage);
    if (lifted.length) {
      out.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `[Not from them: what ${[...new Set(names)].join(", ")} showed you.]`,
          },
          ...lifted,
        ],
      });
    }
  }
  return out;
}
