import { readViewer } from "@/lib/session";
import { safeFetch } from "@/lib/resume/safe-fetch";

/**
 * A picture from the web, for the page to draw. Most sites don't let a page
 * read their images, so the browser asks here and we fetch it — through the
 * same guard every model-chosen URL goes through, since a URL a model picked
 * reaching inside our network is the oldest trick there is.
 *
 * Only for someone connected: an open image proxy is a free one for anybody.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PICTURE = /^image\/|^application\/octet-stream$|^binary\/octet-stream$/i;

const fail = (status: number, reason: string) => new Response(reason, { status });

export async function GET(req: Request) {
  if (!(await readViewer())) return fail(401, "Connect a provider to place pictures from the web.");

  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return fail(400, "That isn't a link.");
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return fail(400, "Only web links can be fetched.");
  }

  let res: Response;
  try {
    res = await safeFetch(target.toString(), {
      headers: {
        "user-agent": UA,
        accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return fail(502, error instanceof Error ? error.message : "That image couldn't be reached.");
  }
  if (!res.ok) return fail(502, `The site answered ${res.status} for that image.`);

  const type = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (type && !PICTURE.test(type)) {
    await res.body?.cancel();
    return fail(415, `That link is a ${type} page, not a picture. Use the image's own address.`);
  }
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    await res.body?.cancel();
    return fail(413, "That image is over 8MB.");
  }

  const reader = res.body?.getReader();
  if (!reader) return fail(502, "That image came back empty.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    total += read.value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return fail(413, "That image is over 8MB.");
    }
    chunks.push(read.value);
  }

  return new Response(new Blob(chunks as BlobPart[]), {
    headers: {
      "content-type": type || "application/octet-stream",
      // Never run as a page of ours, whatever the far end claimed it was.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
    },
  });
}
