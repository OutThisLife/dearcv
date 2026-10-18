/** Browser writes must originate here. Cookie SameSite alone does not protect
 * against an attacker on a sibling subdomain. CLI requests may omit Origin. */
export function sameOriginRequest(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return !site || site === "same-origin" || site === "none";
  try {
    const target = new URL(req.url);
    const host = req.headers.get("host");
    if (host) target.host = host;
    return new URL(origin).origin === target.origin;
  } catch {
    return false;
  }
}

export class RequestBodyError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(status === 413 ? "Request is too large." : "Invalid JSON.");
    this.status = status;
  }
}

export async function readBytes(req: Request, limit: number): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length")) > limit) throw new RequestBodyError(413);
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new RequestBodyError(413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function readJson(req: Request, limit = 32_768): Promise<unknown> {
  const bytes = await readBytes(req, limit);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RequestBodyError(400);
  }
}

/** Attachments already arrive as data URLs/base64. Never let the model SDK
 * fetch a caller-supplied attachment URL on this server. */
export async function localAttachmentsOnly(files: readonly unknown[]) {
  if (files.length) throw new Error("Attach the file itself instead of a remote file URL.");
  return [];
}
