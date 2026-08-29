import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const BUCKET = "resumes";

/** Long enough to fetch and render, short enough that a copied URL is useless. */
const READ_TTL = 60 * 10;

/**
 * The service role, which is only ever held here. Every route that reaches it
 * has already worked out who is asking, so the bucket needs no policies of its
 * own — and because it stays server-side, the key in the browser can read
 * nothing at all.
 */
const storage = url && key ? createClient(url, key).storage.from(BUCKET) : null;

export const canStore = () => storage !== null;

/**
 * Filed under the thread so a thread's files can be found without consulting
 * the table, which is what lets the sweep clean up after a row that is already
 * gone. The random name means replacing a PDF never collides with the one it
 * replaces, and never reveals what the file was called.
 */
export const pdfPath = (threadId: string) => `${threadId}/${crypto.randomUUID()}.pdf`;

/**
 * The browser uploads straight to storage. Routing the bytes through a function
 * would meet the request body limit, and this way the file never touches us.
 */
export async function signUpload(path: string) {
  if (!storage) return null;

  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error) throw error;

  // The signed URL is enough on its own — a plain PUT does it — so the browser
  // never needs a Supabase client, or any key of ours, to upload.
  return { path, signedUrl: data.signedUrl };
}

/**
 * A private bucket has no public URL, so a link has to be minted per read and
 * expires on its own. That is the point: the ownership check that guards the
 * thread now guards the file too, where before the PDF sat at a public address
 * that bypassed it.
 */
export async function signDownload(path: string) {
  if (!storage) return null;

  const { data, error } = await storage.createSignedUrl(path, READ_TTL);
  if (error) return null;

  return data.signedUrl;
}

export async function removeFiles(paths: string[]) {
  if (!storage || paths.length === 0) return;

  const { error } = await storage.remove(paths);
  if (error) throw error;
}

export type StoredFile = { path: string; createdAt: Date };

/** Everything a thread holds, including PDFs it replaced along the way. */
export async function threadFiles(threadId: string): Promise<string[]> {
  if (!storage) return [];

  const { data, error } = await storage.list(threadId);
  if (error) throw error;

  return data.map((file) => `${threadId}/${file.name}`);
}

/**
 * Every file in the bucket, a page at a time. Listing is per folder, and a
 * folder is a thread, so this walks threads and asks each what it holds.
 */
export async function* allFiles(pageSize = 100): AsyncGenerator<StoredFile> {
  if (!storage) return;

  for (let offset = 0; ; offset += pageSize) {
    const { data: folders, error } = await storage.list("", { limit: pageSize, offset });
    if (error) throw error;
    if (folders.length === 0) return;

    for (const folder of folders) {
      // A folder has no id of its own; a stray file at the root does, and
      // nothing we write ever puts one there.
      if (folder.id) continue;

      const { data: files, error: listError } = await storage.list(folder.name);
      if (listError) throw listError;

      for (const file of files) {
        yield {
          path: `${folder.name}/${file.name}`,
          // A file whose age we can't read is treated as new, so it is kept.
          // The other default would sweep it, and of the two mistakes only one
          // deletes somebody's resume.
          createdAt: file.created_at ? new Date(file.created_at) : new Date(),
        };
      }
    }

    if (folders.length < pageSize) return;
  }
}
