import { isThreadId, loadThread, mayRead } from "@/lib/db";
import { readViewer } from "@/lib/session";
import { signDownload } from "@/lib/storage";

/**
 * The stored PDF, for whoever the thread will open for. The bucket is private,
 * so this mints a short-lived link and sends them to it rather than streaming
 * the bytes back through a function.
 *
 * This route is the reason the bucket is private at all: before, the resume sat
 * at a public URL that the thread's ownership check never touched, so anyone
 * holding the file's address read someone's name, address and history without
 * ever loading the page that guards it.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await ctx.params;
  if (!isThreadId(threadId)) return new Response(null, { status: 404 });

  const thread = await loadThread(threadId);
  if (!thread?.pdfPath) return new Response(null, { status: 404 });
  // Same answer either way, so a refusal doesn't confirm the file is there.
  if (!mayRead(thread, await readViewer())) return new Response(null, { status: 404 });

  const url = await signDownload(thread.pdfPath);
  if (!url) return new Response(null, { status: 404 });

  return Response.redirect(url, 307);
}
