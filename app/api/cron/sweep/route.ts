import { canPersist, forgetThreads, knownPdfPaths, staleThreads } from "@/lib/db";
import { allFiles, canStore, removeFiles, threadFiles } from "@/lib/storage";

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

/**
 * Nightly expiry, in two passes: threads that have gone quiet, then files no
 * thread points at any more. Both need the database — with no connection every
 * file looks unclaimed, so nothing is deleted at all.
 *
 * It also keeps the project awake. Supabase pauses a free project after a week
 * without database activity, and a paused project answers nothing at all, so
 * this running nightly is load-bearing beyond what it deletes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Unset means unauthenticated, and an open endpoint that deletes things is
  // worse than one that never runs.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  if (!canPersist() || !canStore()) return Response.json({ swept: 0, files: 0, orphans: 0 });

  try {
    const { swept, files } = await sweepThreads();
    // After the threads, so the files they took with them are already gone
    // from the listing the second pass walks.
    return Response.json({ swept, files, orphans: await sweepOrphans() });
  } catch (error) {
    // All of this is safe to repeat: deleting a file twice is not an error, and
    // a thread whose files went but whose row stayed comes up again tomorrow.
    // So the run just stops and the next one picks up where it left off.
    console.error("Sweep stopped early.", error);
    return Response.json({ error: "sweep" }, { status: 500 });
  }
}

/** Threads nobody has opened in a while, and everything they were holding. */
async function sweepThreads() {
  const stale = await staleThreads(RETENTION_DAYS, BATCH);
  if (stale.length === 0) return { swept: 0, files: 0 };

  // The whole folder, not just the current PDF: a thread that replaced its
  // upload is still holding the one it replaced.
  const paths = (await Promise.all(stale.map((thread) => threadFiles(thread.id)))).flat();

  // Files first. Of the two ways to be half-done, a row that outlives its file
  // is swept again tomorrow, while a file that outlives its row is litter
  // nobody will ever look for.
  await removeFiles(paths);

  return { swept: await forgetThreads(stale.map((thread) => thread.id)), files: paths.length };
}

/**
 * Files with nothing pointing at them: an upload whose thread was never saved,
 * or one replaced by a second upload. The thread pass can't catch the first —
 * there is no row to sweep — and shouldn't catch the second while the thread
 * is still alive.
 */
async function sweepOrphans() {
  const cutoff = Date.now() - GRACE_MS;
  const candidates: string[] = [];

  for await (const file of allFiles()) {
    if (file.createdAt.getTime() >= cutoff) continue;
    candidates.push(file.path);
  }
  if (candidates.length === 0) return 0;

  const claimed = await knownPdfPaths(candidates);
  const orphans = candidates.filter((path) => !claimed.has(path));

  await removeFiles(orphans);
  return orphans.length;
}
