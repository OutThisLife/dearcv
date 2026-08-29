import { del, list } from "@vercel/blob";
import { canPersist, forgetThreads, knownPdfUrls, staleThreads } from "@/lib/db";

/** How long a thread survives without being opened. */
const RETENTION_DAYS = Number(process.env.THREAD_RETENTION_DAYS ?? 7);

/** Enough to clear a backlog over a few nights without risking the timeout. */
const BATCH = 200;

/**
 * How long a file gets to go unclaimed before it counts as abandoned. It
 * reaches storage before the row pointing at it does, so anything younger than
 * this might be a thread that is only halfway saved.
 */
const GRACE_MS = 24 * 60 * 60 * 1000;

/** Pages of storage per run. Whatever is past them keeps until tomorrow. */
const PAGES = 10;

/**
 * Nightly expiry, in two passes: threads that have gone quiet, then files no
 * thread points at any more. Both need the database — with no connection every
 * file looks unclaimed, so nothing is deleted at all.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Unset means unauthenticated, and an open endpoint that deletes things is
  // worse than one that never runs.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (!canPersist()) return Response.json({ swept: 0, files: 0, orphans: 0 });

  try {
    const { swept, files } = await sweepThreads();
    // After the threads, so the files they took with them are already out of
    // the listing the second pass reads.
    return Response.json({ swept, files, orphans: await sweepOrphans() });
  } catch (error) {
    // All of this is safe to repeat: deleting a blob twice is not an error, and
    // a thread whose files went but whose row stayed comes up again tomorrow.
    // So the run just stops and the next one picks up where it left off.
    console.error("Sweep stopped early.", error);
    return Response.json({ error: "sweep" }, { status: 500 });
  }
}

/** Threads nobody has opened in a while, and the PDFs they were holding. */
async function sweepThreads() {
  const stale = await staleThreads(RETENTION_DAYS, BATCH);
  if (stale.length === 0) return { swept: 0, files: 0 };

  const urls = stale.map((thread) => thread.pdfUrl).filter((url): url is string => Boolean(url));

  // Files first: Postgres can't cascade into blob storage, and of the two ways
  // to be half-done, a row that outlives its file is swept again tomorrow while
  // a file that outlives its row is litter nobody will ever look for.
  if (urls.length > 0) await del(urls);

  return { swept: await forgetThreads(stale.map((thread) => thread.id)), files: urls.length };
}

/**
 * Files with nothing pointing at them: an upload whose thread was never saved,
 * or one replaced by a second upload before the first was ever recorded. The
 * thread pass can't catch these, because there is no row left to sweep.
 */
async function sweepOrphans() {
  const cutoff = Date.now() - GRACE_MS;
  let cursor: string | undefined;
  let deleted = 0;

  for (let page = 0; page < PAGES; page++) {
    const { blobs, cursor: next, hasMore } = await list({ cursor, limit: 500 });

    const aged = blobs.filter((blob) => blob.uploadedAt.getTime() < cutoff);
    const claimed = await knownPdfUrls(aged.map((blob) => blob.url));
    const orphans = aged.map((blob) => blob.url).filter((url) => !claimed.has(url));

    if (orphans.length > 0) {
      await del(orphans);
      deleted += orphans.length;
    }

    if (!hasMore || !next) break;
    cursor = next;
  }

  return deleted;
}
