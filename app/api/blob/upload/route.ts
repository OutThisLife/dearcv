import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

/** Ten times a heavy resume, and small enough that a stray file costs nothing. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Hands the browser a short-lived token so the PDF goes straight to storage.
 * Routing the bytes through here instead would meet the request body limit.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;

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
