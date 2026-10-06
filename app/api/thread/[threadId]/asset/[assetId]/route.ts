import {
  assetBytes,
  canPersist,
  isThreadId,
  loadAsset,
  loadThread,
  mayRead,
  saveAsset,
} from "@/lib/db";
import { readViewer } from "@/lib/session";

/**
 * One picture on a thread's resume: written once by the editor when it is
 * made or attached, read back whenever the thread is opened. Read under the
 * thread's own check, so a picture is exactly as private as the resume it is
 * on.
 */

/** A generous photo, a full-page illustration. Past this it isn't decoration. */
const MAX_BYTES = 6 * 1024 * 1024;
/** Plenty for a decorated resume, and a ceiling on one thread as a file host. */
const MAX_THREAD_BYTES = 40 * 1024 * 1024;

const TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

type Params = { params: Promise<{ threadId: string; assetId: string }> };

export async function GET(_req: Request, ctx: Params) {
  const { threadId, assetId } = await ctx.params;
  if (!isThreadId(threadId) || !isThreadId(assetId)) return new Response(null, { status: 404 });

  const viewer = await readViewer();
  const asset = await loadAsset(threadId, assetId);
  if (!asset) return new Response(null, { status: 404 });
  // A thread that exists is read under its own check; one that was never
  // saved only by whoever made the picture.
  const thread = await loadThread(threadId);
  const allowed = thread
    ? mayRead(thread, viewer)
    : asset.ownerId === null || asset.ownerId === viewer;
  if (!allowed) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(asset.data), {
    headers: {
      "content-type": asset.mediaType,
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

export async function PUT(req: Request, ctx: Params) {
  const { threadId, assetId } = await ctx.params;
  if (!isThreadId(threadId) || !isThreadId(assetId)) {
    return Response.json({ error: "Bad id." }, { status: 400 });
  }
  // As with the resume itself: without a database the picture lives as long
  // as the tab does, which is a setup rather than a failure.
  if (!canPersist()) return Response.json({ saved: false }, { status: 503 });
  const viewer = await readViewer();
  if (!viewer) return Response.json({ saved: false }, { status: 401 });

  const mediaType = req.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!TYPES.has(mediaType)) return Response.json({ error: "Not a picture." }, { status: 415 });

  const data = new Uint8Array(await req.arrayBuffer());
  if (!data.length || data.length > MAX_BYTES) {
    return Response.json({ error: "That picture is too big." }, { status: 413 });
  }
  if ((await assetBytes(threadId)) + data.length > MAX_THREAD_BYTES) {
    return Response.json(
      { error: "This resume holds as many pictures as it can." },
      { status: 413 },
    );
  }

  const saved = await saveAsset(threadId, assetId, { mediaType, data }, viewer);
  if (!saved) return Response.json({ saved: false }, { status: 409 });
  return Response.json({ saved: true });
}
