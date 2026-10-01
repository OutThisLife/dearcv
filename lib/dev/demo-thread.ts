import type { UIMessage } from "ai";
import transcription from "./brooklyn-resume.json";

/**
 * Development only: the conversation `/?demo` opens on. Each request is what
 * was said, what the agent called to answer it, and what it said back — the
 * calls are replayed through the real tools onto the sample resume, so the
 * transcript, the page and the history all tell the same story. One request
 * makes two edits and one is too long for the history bar, on purpose.
 *
 * Plain data, kept apart from the replay, because the editor needs the
 * messages while it first renders and the replay needs a PDF parser.
 */
export type DemoCall = { tool: string; input: Record<string, unknown> };
export type DemoRequest = { id: string; text: string; reply: string; calls: DemoCall[] };

const braintrust = transcription.sections
  .find((section) => section.id === "experience")
  ?.items.find((item) => item.id === "braintrust");

export const DEMO_REQUESTS: DemoRequest[] = [
  {
    id: "demo-ask-0",
    text: "Add an open source section for my Hermes work",
    reply: "Added Open Source above your experience, set like the rest of the page.",
    calls: [
      {
        tool: "upsert_section",
        input: {
          id: "open-source",
          title: "Open Source",
          kind: "projects",
          before: "experience",
          items: [
            {
              id: "hermes",
              title: "Hermes Agent",
              href: "https://github.com/NousResearch/hermes-agent",
              start: "2025",
              end: "Present",
              bullets: [
                "Built the desktop app's interface, its PDF pipeline, and its ChatGPT sign-in",
              ],
            },
          ],
        },
      },
    ],
  },
  {
    id: "demo-ask-1",
    text: "Add my new job at Nous, and make the BrainTrust voice agent bullet sound less like a ticket",
    reply:
      "Nous Research is in as your current role, and the BrainTrust bullet now leads with what you built.",
    calls: [
      {
        tool: "upsert_item",
        input: {
          sectionId: "experience",
          before: "braintrust",
          item: {
            id: "nous",
            org: "Nous Research",
            href: "https://nousresearch.com",
            title: "Design Engineer",
            start: "Mar 2026",
            end: "Present",
            bullets: [
              "Leads the Hermes desktop app's interface, from the chat surface to its design system",
              "Shipped native PDF rendering that keeps an uploaded resume's own typography",
            ],
          },
        },
      },
      ...(braintrust
        ? [
            {
              tool: "upsert_item",
              input: {
                sectionId: "experience",
                item: {
                  ...braintrust,
                  bullets: [
                    "Built a real-time AI interview voice agent visualization in three.js and custom shaders",
                    ...braintrust.bullets.slice(1),
                  ],
                },
              },
            },
          ]
        : []),
    ],
  },
  {
    id: "demo-ask-2",
    text: "Make the rules a deep teal",
    reply: "The rules are deep teal now; the type stays black.",
    calls: [{ tool: "update_theme", input: { accent: "#1f4e5f" } }],
  },
  {
    id: "demo-ask-3",
    text: "Drop the skills section, it repeats the roles",
    reply: "Removed Technical Skills.",
    calls: [{ tool: "remove_section", input: { id: "skills" } }],
  },
];

/** The requests as the chat stores them: each ask, then a reply that made its calls and said so. */
export const DEMO_MESSAGES = DEMO_REQUESTS.flatMap((request, i): UIMessage[] => [
  { id: request.id, role: "user", parts: [{ type: "text", text: request.text }] },
  {
    id: `demo-reply-${i}`,
    role: "assistant",
    parts: [
      { type: "step-start" },
      ...request.calls.map(
        (call, j) =>
          ({
            type: `tool-${call.tool}`,
            toolCallId: `demo-${i}-${j}`,
            state: "output-available",
            input: call.input,
            output: { ok: true },
          }) as UIMessage["parts"][number],
      ),
      { type: "step-start" },
      { type: "text", text: request.reply, state: "done" },
    ],
  },
]);
