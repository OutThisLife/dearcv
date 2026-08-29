import { NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createModel, llmErrorMessage, readLlmRequest } from "@/lib/llm";
import { resumeFromText } from "@/lib/resume/from-source";

export const maxDuration = 60;

const body = z.object({ text: z.string().trim().min(1) });

export async function POST(req: Request) {
  const { apiKey, provider, model } = readLlmRequest(req);
  if (!apiKey) {
    return Response.json({ error: "Connect a provider to parse a PDF." }, { status: 401 });
  }

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "No PDF text." }, { status: 400 });
  }

  const llm = createModel({ apiKey, provider, model });

  try {
    const resume = await resumeFromText({
      model: llm.object,
      text: parsed.data.text,
      abortSignal: req.signal,
    });
    return Response.json(resume);
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return Response.json(
        { error: "Couldn't turn that PDF into a resume. Try again." },
        { status: 422 },
      );
    }
    return Response.json({ error: llmErrorMessage(error) }, { status: 502 });
  }
}
