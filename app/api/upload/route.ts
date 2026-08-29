import { isThreadId } from "@/lib/db";
import { readViewer } from "@/lib/session";
import { canStore, pdfPath, signUpload } from "@/lib/storage";

/**
 * Hands the browser a one-shot URL to PUT the PDF to. The bytes go straight to
 * storage rather than through here, which would meet the request body limit.
 *
 * Only for someone we can name. Storing a file means answering whose it is
 * later, and an endpoint that mints write URLs for anyone who asks is a free
 * file host. Connecting a provider is what mints the session, so this turns
 * nobody real away — and without one the thread still works, it just lives as
 * long as the tab does.
 */
export async function POST(req: Request) {
  if (!canStore()) return Response.json({ error: "No storage configured." }, { status: 503 });
  if (!(await readViewer())) {
    return Response.json({ error: "Connect a provider to keep files." }, { status: 401 });
  }

  const { threadId } = (await req.json().catch(() => ({}))) as { threadId?: string };
  // The path is built here, never accepted from the caller: it decides which
  // thread the file is filed under, and so who can later read it.
  if (!isThreadId(threadId)) {
    return Response.json({ error: "Bad thread id." }, { status: 400 });
  }

  const signed = await signUpload(pdfPath(threadId));
  if (!signed) return Response.json({ error: "No storage configured." }, { status: 503 });

  return Response.json(signed);
}
