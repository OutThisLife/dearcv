import { neon } from "@neondatabase/serverless";
import type { UIMessage } from "ai";
import { resumeDocSchema, type ResumeDoc } from "@/lib/resume/schema";

/**
 * Persistence is optional. Without DATABASE_URL the app runs exactly as it did
 * before — everything lives in memory and a reload starts over — so local work
 * and previews don't need a database standing behind them.
 */
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export const canPersist = () => sql !== null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thread ids come from the URL, so anything that isn't one never reaches SQL. */
export const isThreadId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

export type StoredThread = {
  id: string;
  doc: ResumeDoc | null;
  sourceText: string;
  sourceName: string;
  pdfUrl: string | null;
  messages: UIMessage[];
  /** Null for a thread that only its link protects. */
  ownerId: string | null;
};

export async function loadThread(id: string): Promise<StoredThread | null> {
  if (!sql || !isThreadId(id)) return null;

  const [row] = await sql`
    select doc, source_text, source_name, pdf_url, messages, owner_id
    from threads where id = ${id}
  `;
  if (!row) return null;

  // A schema change shouldn't strand someone on a dead link, so a document we
  // can no longer read comes back as an empty one rather than an error.
  const doc = resumeDocSchema.safeParse(row.doc);
  return {
    id,
    doc: doc.success ? doc.data : null,
    sourceText: row.source_text ?? "",
    sourceName: row.source_name ?? "",
    pdfUrl: row.pdf_url ?? null,
    messages: Array.isArray(row.messages) ? (row.messages as UIMessage[]).map(identify) : [],
    ownerId: row.owner_id ?? null,
  };
}

/**
 * Two messages that share an id are one message as far as the thread's history
 * is concerned, and the turns after the clash re-parent to the root — a
 * conversation reopens as a row of branches. Rows written before the reply
 * carried an id of its own are repaired on the way out.
 */
const identify = (message: UIMessage, index: number): UIMessage =>
  message.id ? message : { ...message, id: `restored-${index}` };

/** Whether a thread will open for whoever is asking. */
export const mayRead = (thread: StoredThread, viewer: string | null) =>
  thread.ownerId === null || thread.ownerId === viewer;

/**
 * Both writes below carry the same guard, and both return whether it let them
 * through. An owner is stamped on at creation and never reassigned: adopting a
 * thread that arrived without one would mean the first connected person to open
 * a shared link takes it over, locking out whoever sent it.
 *
 * The guard lives in the statement rather than in a read beforehand, so two
 * writers can't both pass the check before either of them writes.
 */

/** The resume half, written by the editor as it changes. */
export async function saveResume(
  id: string,
  resume: Pick<StoredThread, "doc" | "sourceText" | "sourceName" | "pdfUrl">,
  owner: string | null,
) {
  if (!sql || !isThreadId(id)) return false;

  const rows = await sql`
    insert into threads (id, doc, source_text, source_name, pdf_url, owner_id)
    values (${id}, ${JSON.stringify(resume.doc)}, ${resume.sourceText},
            ${resume.sourceName}, ${resume.pdfUrl}, ${owner})
    on conflict (id) do update set
      doc = excluded.doc,
      source_text = excluded.source_text,
      source_name = excluded.source_name,
      pdf_url = excluded.pdf_url,
      updated_at = now()
    where threads.owner_id is null or threads.owner_id = excluded.owner_id
    returning id
  `;
  return rows.length > 0;
}

/**
 * Threads nobody has come back to, oldest first. Capped because the sweep runs
 * inside a request and a backlog is better cleared over a few nights than not
 * at all.
 */
export async function staleThreads(days: number, limit: number) {
  if (!sql) return [];

  const rows = await sql`
    select id, pdf_url
    from threads
    where updated_at < now() - make_interval(days => ${days})
    order by updated_at
    limit ${limit}
  `;
  return rows.map((row) => ({
    id: row.id as string,
    pdfUrl: (row.pdf_url ?? null) as string | null,
  }));
}

export async function forgetThreads(ids: string[]) {
  if (!sql || ids.length === 0) return 0;

  const rows = await sql`delete from threads where id = any(${ids}::uuid[]) returning id`;
  return rows.length;
}

/**
 * Which of these files a thread still points at. Asked the other way round —
 * every url we know of — the answer grows with the table; this way the question
 * stays the size of the page being swept.
 */
export async function knownPdfUrls(urls: string[]) {
  if (!sql || urls.length === 0) return new Set<string>();

  const rows = await sql`select pdf_url from threads where pdf_url = any(${urls}::text[])`;
  return new Set(rows.map((row) => row.pdf_url as string));
}

/** The chat half, written server-side once a turn finishes streaming. */
export async function saveMessages(id: string, messages: UIMessage[], owner: string | null) {
  if (!sql || !isThreadId(id)) return false;

  const rows = await sql`
    insert into threads (id, messages, owner_id)
    values (${id}, ${JSON.stringify(messages)}, ${owner})
    on conflict (id) do update set
      messages = excluded.messages,
      updated_at = now()
    where threads.owner_id is null or threads.owner_id = excluded.owner_id
    returning id
  `;
  return rows.length > 0;
}
