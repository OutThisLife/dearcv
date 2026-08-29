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
};

export async function loadThread(id: string): Promise<StoredThread | null> {
  if (!sql || !isThreadId(id)) return null;

  const [row] = await sql`
    select doc, source_text, source_name, pdf_url, messages
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
  };
}

/** The resume half, written by the editor as it changes. */
export async function saveResume(
  id: string,
  resume: Pick<StoredThread, "doc" | "sourceText" | "sourceName" | "pdfUrl">,
) {
  if (!sql || !isThreadId(id)) return;

  await sql`
    insert into threads (id, doc, source_text, source_name, pdf_url)
    values (${id}, ${JSON.stringify(resume.doc)}, ${resume.sourceText},
            ${resume.sourceName}, ${resume.pdfUrl})
    on conflict (id) do update set
      doc = excluded.doc,
      source_text = excluded.source_text,
      source_name = excluded.source_name,
      pdf_url = excluded.pdf_url,
      updated_at = now()
  `;
}

/** The chat half, written server-side once a turn finishes streaming. */
export async function saveMessages(id: string, messages: UIMessage[]) {
  if (!sql || !isThreadId(id)) return;

  await sql`
    insert into threads (id, messages)
    values (${id}, ${JSON.stringify(messages)})
    on conflict (id) do update set
      messages = excluded.messages,
      updated_at = now()
  `;
}
