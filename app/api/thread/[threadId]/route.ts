import { z } from "zod";
import { canPersist, isThreadId, saveResume } from "@/lib/db";
import { resumeDocSchema } from "@/lib/resume/schema";
import { readViewer } from "@/lib/session";

const body = z.object({
  doc: resumeDocSchema.nullable(),
  sourceText: z.string().default(""),
  sourceName: z.string().default(""),
  pdfUrl: z.string().nullable().default(null),
});

/**
 * The resume half of a thread. The chat half is written by the chat route as
 * each turn finishes; this covers everything that changes between turns —
 * an upload, a tool edit, a theme change.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await ctx.params;
  if (!isThreadId(threadId)) {
    return Response.json({ error: "Bad thread id." }, { status: 400 });
  }
  // Without a database this is a no-op rather than a failure, so the editor
  // does not have to know whether it is running against one.
  if (!canPersist()) return Response.json({ saved: false });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "Bad resume payload." }, { status: 400 });
  }

  const saved = await saveResume(threadId, parsed.data, await readViewer());
  if (!saved) {
    return Response.json({ error: "That thread belongs to another key." }, { status: 403 });
  }

  return Response.json({ saved: true });
}
