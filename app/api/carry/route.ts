import { streamText, Output } from "ai";
import { z } from "zod";
import { createModel, llmErrorMessage, readLlmRequest } from "@/lib/llm";
import { CARRY_TEXT, SOURCE_CHARS } from "@/lib/prompts";
import { latestText } from "@/lib/resume/reading-head";
import { resumeBasicsSchema, resumeItemSchema, resumeSectionSchema } from "@/lib/resume/schema";

export const maxDuration = 60;

/**
 * Transcribes an uploaded resume into the structured document, in the
 * background, right after upload. Without this the transcription happened
 * lazily inside the first chat turn — the model had to carry the whole resume
 * through one giant tool call before it could change a single field, which is
 * why asking for a name change looked like the resume being regenerated.
 *
 * Streamed as lines of JSON: `{ at }` each time the model reaches new text,
 * so the page can follow where it has got to, then `{ content }` once it is
 * done, or `{ error }`. Failure costs nothing: the chat keeps the lazy carry
 * as its fallback.
 */

// Same shape the editing tools use, except a list may be left out when there
// is nothing in it: a skills section has no items, and an older role often
// has no bullets — iFLY, a studio, a line with just a name and years. Strict
// about those, a whole faithful transcription was thrown away over four
// missing empty arrays.
const carrySchema = z.object({
  basics: resumeBasicsSchema,
  sections: z.array(
    resumeSectionSchema.extend({
      items: z
        .array(resumeItemSchema.extend({ bullets: z.array(z.string()).default([]) }))
        .default([]),
    }),
  ),
});

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sourceText?: unknown } | null;
  const sourceText = typeof body?.sourceText === "string" ? body.sourceText.trim() : "";
  if (!sourceText) {
    return Response.json({ error: "Nothing to transcribe." }, { status: 400 });
  }

  const { apiKey, provider, model, plan } = await readLlmRequest(req);
  if (!apiKey) {
    return Response.json({ error: "No key connected." }, { status: 401 });
  }

  const llm = createModel({ apiKey, provider, model, plan });

  // The stream reports failure here rather than throwing it, and the reason
  // (a turned-down key, a plan limit) is worth more than "no output".
  let failure: unknown;
  const result = streamText({
    model: llm.model,
    output: Output.object({
      schema: carrySchema,
      name: "ResumeContent",
      description: "The uploaded resume, transcribed word for word.",
    }),
    instructions: CARRY_TEXT,
    prompt: sourceText.slice(0, SOURCE_CHARS),
    temperature: 0,
    // OpenAI's strict mode wants every field required, and a resume's are
    // not: a headline, a link, an end date are each often absent. Strict
    // refused the whole schema, so every upload on a key or a ChatGPT plan
    // failed to transcribe. The reply is still checked against the schema.
    providerOptions: { openai: { strictJsonSchema: false } },
    abortSignal: req.signal,
    onError: ({ error }) => {
      failure ??= error;
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: object) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        let last = "";
        for await (const partial of result.partialOutputStream) {
          const at = latestText(partial);
          if (at && at !== last) {
            last = at;
            send({ at });
          }
        }
        const content = await result.output;
        if (!content) throw new Error("The model didn't return a resume.");
        send({ content });
      } catch (error) {
        console.error("Carry failed.", failure ?? error);
        send({ error: llmErrorMessage(failure ?? error) });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
}
