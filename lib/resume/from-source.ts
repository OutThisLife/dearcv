import { generateText, Output, type LanguageModel } from "ai";
import { INGEST_INSTRUCTIONS, SOURCE_CHARS } from "@/lib/prompts";
import { resumeDocSchema, type ResumeDoc } from "@/lib/resume/schema";

export async function resumeFromText(input: {
  model: LanguageModel;
  text: string;
  abortSignal?: AbortSignal;
}): Promise<ResumeDoc> {
  const { output } = await generateText({
    model: input.model,
    output: Output.object({
      schema: resumeDocSchema,
      name: "ResumeDoc",
      description: "A structured resume the live PDF renderer can draw.",
    }),
    instructions: INGEST_INSTRUCTIONS,
    prompt: input.text.slice(0, SOURCE_CHARS),
    temperature: 0,
    abortSignal: input.abortSignal,
  });

  if (!output) {
    throw new Error("The model didn't return a resume.");
  }
  return output;
}
