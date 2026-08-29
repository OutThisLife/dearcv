import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { readViewer } from "@/lib/session";

/** Ten times a heavy resume, and small enough that a stray file costs nothing. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Hands the browser a short-lived token so the PDF goes straight to storage.
 * Routing the bytes through here instead would meet the request body limit.
 *
 * Only for someone we can name. Storing a file means answering whose it is
 * later, and an endpoint that mints write tokens for anyone who asks is a
 * free file host. Connecting a provider is what mints the session, so this
 * turns nobody real away — and without one the thread still works, it just
 * lives as long as the tab does.
 */
export async function POST(req: Request) {
  if (!(await readViewer())) {
    return Response.json({ error: "Connect a provider to keep files." }, { status: 401 });
  }

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Bad upload request." }, { status: 400 });
  }

  try {
    return Response.json(
      await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        }),
        // The browser tells us the URL when it saves the thread, so there is
        // nothing to do here.
        onUploadCompleted: async () => {},
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
