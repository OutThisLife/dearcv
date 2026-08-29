import { lookup } from "node:dns/promises";

/**
 * The model chooses the URL and the server makes the request, which is the
 * shape of every SSRF. A public page is the only legitimate target, so
 * anything that resolves inside the network is refused — before the first
 * request and again at every redirect, since a public host is free to bounce
 * you somewhere private.
 */

const MAX_REDIRECTS = 5;
const MAX_BYTES = 3_000_000;

const BLOCKED_HOST = /^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i;

function isBlockedV4(ip: string) {
  const part = ip.split(".").map(Number);
  if (part.length !== 4 || part.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = part;

  return (
    a === 0 || // this network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier NAT
    (a === 169 && b === 254) || // link-local, and the cloud metadata address
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0) || // protocol assignments
    (a === 198 && b >= 18 && b <= 19) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

function isBlockedV6(ip: string) {
  const address = ip.toLowerCase().split("%")[0];
  if (address === "::" || address === "::1") return true;

  // ::ffff:10.0.0.1 and friends are IPv4 wearing a hat.
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);

  return (
    /^f[cd]/.test(address) || // unique local
    /^fe[89ab]/.test(address) || // link-local
    address.startsWith("ff") // multicast
  );
}

async function assertPublic(target: URL) {
  const host = target.hostname.replace(/^\[|\]$/g, "");

  if (BLOCKED_HOST.test(host)) {
    throw new Error(`${target.hostname} is not a public address.`);
  }

  // A literal address never reaches DNS, so check it directly first.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isBlockedV4(host)) throw new Error(`${host} is not a public address.`);
    return;
  }
  if (host.includes(":")) {
    if (isBlockedV6(host)) throw new Error(`${host} is not a public address.`);
    return;
  }

  const resolved = await lookup(host, { all: true });
  const blocked = resolved.some(({ address, family }) =>
    family === 6 ? isBlockedV6(address) : isBlockedV4(address),
  );
  if (!resolved.length || blocked) {
    throw new Error(`${host} resolves to a private address.`);
  }
}

/** Follows redirects by hand so every hop gets checked, not just the first. */
export async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  let target = new URL(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(target);

    const res = await fetch(target, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status > 399) return res;

    const next = res.headers.get("location");
    if (!next) return res;

    await res.body?.cancel();
    target = new URL(next, target);

    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error(`That page redirected to ${target.protocol}, which cannot be read.`);
    }
  }

  throw new Error("That page redirected too many times.");
}

/**
 * Reads at most MAX_BYTES. `res.text()` buffers whatever the server decides to
 * send, and the far end is not ours to trust.
 */
export async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const charset = res.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1];
  const body = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk.subarray(0, Math.min(chunk.length, total - at)), at);
    at += chunk.length;
    if (at >= total) break;
  }

  try {
    return new TextDecoder(charset ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder().decode(body);
  }
}
