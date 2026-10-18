import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

const MAX_REDIRECTS = 5;
const MAX_BYTES = 3_000_000;

export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(ip) !== 6) return false;
  // Only global unicast. This also excludes mapped IPv4, NAT64, loopback,
  // local, multicast and deprecated IPv4-compatible representations.
  const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const first = parseInt(normalized.split(":")[0], 16);
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    !(
      first === 0x2001 &&
      (parseInt(normalized.split(":")[1] || "0", 16) <= 0x1ff || normalized.startsWith("2001:db8:"))
    ) &&
    !normalized.startsWith("2002:") &&
    !normalized.startsWith("3fff:")
  );
}

export async function publicTarget(target: URL) {
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
    throw new Error("Only public HTTP(S) links without credentials can be fetched.");
  }
  if (target.port && target.port !== "80" && target.port !== "443") {
    throw new Error("Only standard web ports can be fetched.");
  }
  const host = target.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (/^(localhost|.*\.localhost|.*\.internal|.*\.local)$/i.test(host)) {
    throw new Error("That is not a public address.");
  }
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("That is not a public address.");
  }
  return addresses[0];
}

/** Connect to the checked IP, retaining the hostname for TLS and Host. A second
 * DNS lookup during fetch would let a rebinding host evade the check. */
export async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let target = new URL(url);
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
    : AbortSignal.timeout(20_000);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const pinned = await publicTarget(target);
    signal.throwIfAborted();
    const headers = new Headers(init.headers);
    headers.delete("host");
    headers.delete("authorization");
    headers.delete("cookie");
    headers.set("accept-encoding", "identity");
    const res = await new Promise<Response>((resolve, reject) => {
      const request = target.protocol === "https:" ? httpsRequest : httpRequest;
      const req = request(
        target,
        {
          method: "GET",
          headers: Object.fromEntries(headers),
          signal,
          agent: false,
          lookup: (_host, options, callback) => {
            if (options.all) callback(null, [pinned]);
            else callback(null, pinned.address, pinned.family);
          },
        },
        (incoming) => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (value !== undefined)
              responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
          }
          const status = incoming.statusCode ?? 502;
          const noBody = [204, 205, 304].includes(status);
          if (noBody) incoming.resume();
          resolve(
            new Response(noBody ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>), {
              status,
              headers: responseHeaders,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
    if (![301, 302, 303, 307, 308].includes(res.status)) return res;
    const next = res.headers.get("location");
    if (!next) return res;
    await res.body?.cancel();
    target = new URL(next, target);
  }
  throw new Error("That page redirected too many times.");
}

export async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, MAX_BYTES - total);
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const body = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.length;
  }
  const charset = res.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(body);
  } catch {
    return new TextDecoder().decode(body);
  }
}
