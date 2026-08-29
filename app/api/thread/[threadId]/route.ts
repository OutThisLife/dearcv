import { z } from "zod";
import { canPersist, isThreadId, saveResume } from "@/lib/db";
import { SOURCE_CHARS } from "@/lib/prompts";
import { resumeDocSchema } from "@/lib/resume/schema";
import { readViewer } from "@/lib/session";

/**
 * A resume is a couple of pages of text. Anything approaching this is not one,
 * and the bound is what stops a row from being used as free storage.
 */
const MAX_BYTES = 256 * 1024;

const readJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Only ever one of our own blobs. `z.url()` would take `javascript:` just as
 * happily, and this value comes back out as the source of the preview.
 */
const storedFile = z
  .string()
  .max(512)
  .refine((value) => {
    try {
      const { protocol, hostname } = new URL(value);
      return protocol === "https:" && hostname.endsWith(".public.blob.vercel-storage.com");
    } catch {
      return false;
    }
  }, "Not a stored file.");

const body = z.object({
  doc: resumeDocSchema.nullable(),
  // The same ceiling the prompt trims to, enforced again here because the
  // browser doing the trimming is not the one we have to worry about.
  sourceText: z.string().max(SOURCE_CHARS).default(""),
  sourceName: z.string().max(256).default(""),
  pdfUrl: storedFile.nullable().default(null),
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

  // Same bargain the upload route strikes: a thread is kept for someone we can
  // name, and anyone else gets one that lasts as long as their tab. Writing
  // rows for strangers would let anyone fill the database a UUID at a time.
  const viewer = await readViewer();
  if (!viewer) return Response.json({ saved: false });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return Response.json({ error: "That resume is too big." }, { status: 413 });
  }

  const parsed = body.safeParse(readJson(raw));
  if (!parsed.success) {
    return Response.json({ error: "Bad resume payload." }, { status: 400 });
  }

  const saved = await saveResume(threadId, parsed.data, viewer);
  if (!saved) {
    return Response.json({ error: "That thread belongs to another key." }, { status: 403 });
  }

  return Response.json({ saved: true });
}
