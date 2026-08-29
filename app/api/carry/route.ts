import { generateText, Output } from "ai";
import { z } from "zod";
import { createModel, llmErrorMessage, readLlmRequest } from "@/lib/llm";
import { CARRY_TEXT, SOURCE_CHARS } from "@/lib/prompts";
import { resumeBasicsSchema, resumeItemSchema, resumeSectionSchema } from "@/lib/resume/schema";

export const maxDuration = 60;

/**
 * Transcribes an uploaded resume into the structured document, in the
 * background, right after upload. Without this the transcription happened
 * lazily inside the first chat turn — the model had to carry the whole resume
 * through one giant tool call before it could change a single field, which is
 * why asking for a name change looked like the resume being regenerated.
 *
 * Failure here costs nothing: the chat keeps the lazy carry as its fallback.
 */

// Same shape the editing tools use, except items may be omitted — a skills
// section has none, and requiring the empty array is the exact validation the
// model kept tripping over mid-conversation.
const carrySchema = z.object({
  basics: resumeBasicsSchema,
  sections: z.array(resumeSectionSchema.extend({ items: z.array(resumeItemSchema).default([]) })),
});

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sourceText?: unknown } | null;
  const sourceText = typeof body?.sourceText === "string" ? body.sourceText.trim() : "";
  if (!sourceText) {
    return Response.json({ error: "Nothing to transcribe." }, { status: 400 });
  }

  const { apiKey, provider, model } = readLlmRequest(req);
  if (!apiKey) {
    return Response.json({ error: "No key connected." }, { status: 401 });
  }

  const llm = createModel({ apiKey, provider, model });

  try {
    const { output } = await generateText({
      model: llm.model,
      output: Output.object({
        schema: carrySchema,
        name: "ResumeContent",
        description: "The uploaded resume, transcribed word for word.",
      }),
      instructions: CARRY_TEXT,
      prompt: sourceText.slice(0, SOURCE_CHARS),
      temperature: 0,
      abortSignal: req.signal,
    });

    if (!output) throw new Error("The model didn't return a resume.");
    return Response.json({ content: output });
  } catch (error) {
    console.error("Carry failed.", error);
    return Response.json({ error: llmErrorMessage(error) }, { status: 502 });
  }
}
