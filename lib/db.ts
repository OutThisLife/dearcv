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
    messages: Array.isArray(row.messages) ? (row.messages as UIMessage[]) : [],
    ownerId: row.owner_id ?? null,
  };
}

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
