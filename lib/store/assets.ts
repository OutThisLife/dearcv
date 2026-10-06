import { create } from "zustand";
import { ASSET, isAsset } from "@/lib/resume/art";

/**
 * The pictures on a resume, kept apart from the document. A picture is tens
 * or hundreds of kilobytes; held in the document it would be copied into
 * every step of the history and every save. The document names it instead —
 * `asset:<id>` for one made or uploaded here, its URL for one found on the
 * web — and this holds what each name resolves to, ready to draw.
 *
 * A raster picture is held as a PNG or JPEG data URL, which is what a PDF
 * can embed; an SVG as its markup, so it is drawn as vectors.
 */

export type AssetFile = {
  /** A data URL, or SVG markup. */
  data: string;
  width: number;
  height: number;
  /** Where it lives once stored with the thread, so a reload can fetch it again. */
  path?: string;
};

type AssetsState = {
  files: Record<string, AssetFile>;
  /** URLs and assets being fetched, so two renders never fetch one twice. */
  loading: Record<string, Promise<AssetFile | null>>;
  /** URLs and assets that could not be had, and why. */
  failed: Record<string, string>;
  put: (key: string, file: AssetFile) => void;
};

export const useAssetsStore = create<AssetsState>()((set) => ({
  files: {},
  loading: {},
  failed: {},
  put: (key, file) => set((state) => ({ files: { ...state.files, [key]: file } })),
}));

export const newAssetId = () => `${ASSET}${crypto.randomUUID()}`;

/** What a PDF can embed without help. */
const EMBEDDABLE = /^data:image\/(png|jpe?g);/i;

/** Long enough for a full-page background at print resolution, no longer. */
const MAX_EDGE = 2400;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image couldn't be decoded."));
    image.src = src;
  });
}

/**
 * Any picture the browser can show — WebP, GIF, AVIF, an oversized photo — as
 * one a PDF can carry: PNG when it might be see-through, JPEG when it can't.
 */
export async function toEmbeddable(blob: Blob): Promise<AssetFile> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const asIs = await blobToDataUrl(blob);
    if (scale === 1 && EMBEDDABLE.test(asIs)) return { data: asIs, width, height };

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't prepare that image.");
    ctx.drawImage(image, 0, 0, width, height);
    const opaque = /jpe?g/i.test(blob.type);
    return { data: canvas.toDataURL(opaque ? "image/jpeg" : "image/png", 0.9), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const isSvg = (type: string, text: string) =>
  /svg/i.test(type) || /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text);

function svgSize(markup: string) {
  const box = markup.match(
    /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i,
  );
  if (box) return { width: Number(box[1]), height: Number(box[2]) };
  const width = Number(markup.match(/\swidth\s*=\s*["']([\d.]+)/i)?.[1]);
  const height = Number(markup.match(/\sheight\s*=\s*["']([\d.]+)/i)?.[1]);
  return width > 0 && height > 0 ? { width, height } : { width: 1, height: 1 };
}

/** A fetched or uploaded file, ready to draw. */
export async function readPicture(blob: Blob): Promise<AssetFile> {
  const head = await blob
    .slice(0, 2048)
    .text()
    .catch(() => "");
  if (isSvg(blob.type, head)) {
    const markup = await blob.text();
    return { data: markup, ...svgSize(markup) };
  }
  if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream" && blob.type) {
    throw new Error(`That link is ${blob.type}, not a picture.`);
  }
  return toEmbeddable(blob);
}

/**
 * The bytes of a picture on the web. Straight from its host when it allows
 * that (Iconify and most image CDNs do), otherwise through our own route:
 * most sites don't let a page read their images, and the route checks the
 * address is a public one before it goes anywhere.
 */
async function fetchPicture(url: string): Promise<Blob> {
  try {
    const direct = await fetch(url, { mode: "cors", credentials: "omit" });
    if (direct.ok) return await direct.blob();
  } catch {
    // Not readable from here; the route can still fetch it.
  }
  const res = await fetch(`/api/image?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const reason = await res.text().catch(() => "");
    throw new Error(reason.replace(/\.\s*$/, "") || `That image answered ${res.status}`);
  }
  return res.blob();
}

/** A stored asset, from the thread it was saved with. */
async function fetchStored(threadId: string, key: string): Promise<Blob> {
  const res = await fetch(`/api/thread/${threadId}/asset/${key.slice(ASSET.length)}`);
  if (!res.ok) throw new Error("That picture is no longer stored.");
  return res.blob();
}

/**
 * What a picture's name resolves to, fetched the first time it is asked for.
 * Resolves to null, never throws: a picture that can't be had is drawn as
 * nothing, and the reason is kept for whoever placed it to hear.
 */
export function resolvePicture(key: string, threadId: string): Promise<AssetFile | null> {
  const state = useAssetsStore.getState();
  const known = state.files[key];
  if (known) return Promise.resolve(known);
  if (key in state.failed) return Promise.resolve(null);
  const pending = state.loading[key];
  if (pending) return pending;

  const load = (async () => {
    try {
      const blob = isAsset(key) ? await fetchStored(threadId, key) : await fetchPicture(key);
      const file = await readPicture(blob);
      useAssetsStore.getState().put(key, isAsset(key) ? { ...file, path: key } : file);
      return file;
    } catch (error) {
      useAssetsStore.setState((s) => ({
        failed: { ...s.failed, [key]: error instanceof Error ? error.message : String(error) },
      }));
      return null;
    } finally {
      useAssetsStore.setState((s) => {
        const { [key]: _, ...loading } = s.loading;
        return { loading };
      });
    }
  })();
  useAssetsStore.setState((s) => ({ loading: { ...s.loading, [key]: load } }));
  return load;
}

/** Forgets that a URL failed, so placing it again tries again. */
export const retryPicture = (key: string) =>
  useAssetsStore.setState((s) => {
    const { [key]: _, ...failed } = s.failed;
    return { failed };
  });

function dataUrlBytes(dataUrl: string) {
  const [head, body = ""] = dataUrl.split(",", 2);
  const mediaType = head?.match(/^data:([^;,]+)/)?.[1] ?? "application/octet-stream";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mediaType, bytes };
}

/**
 * Keeps a picture made or attached here: drawn at once from memory, and
 * written to the thread so a reload, another device or the PDF route can
 * fetch it again. Writing is best effort — without a database or a session
 * the picture lives as long as the tab does, as the resume itself would.
 */
export async function keepPicture(key: string, file: AssetFile, threadId: string) {
  useAssetsStore.getState().put(key, { ...file, path: key });
  retryPicture(key);
  if (!threadId) return;
  const body = file.data.startsWith("data:")
    ? dataUrlBytes(file.data)
    : { mediaType: "image/svg+xml", bytes: new TextEncoder().encode(file.data) };
  await fetch(`/api/thread/${threadId}/asset/${key.slice(ASSET.length)}`, {
    method: "PUT",
    headers: { "content-type": body.mediaType },
    body: body.bytes,
  }).catch(() => undefined);
}

/** The ids of made pictures already kept, so each is kept once. */
const kept = new Set<string>();

/**
 * A picture generate_image made, from its call's result: the one time its
 * bytes cross the wire. Kept under the id the model was given, so it can
 * place it straight away.
 */
export function keepMade(output: unknown, threadId: string) {
  const made = output as {
    ok?: boolean;
    asset?: unknown;
    data?: unknown;
    mediaType?: unknown;
  } | null;
  if (!made?.ok || typeof made.asset !== "string" || typeof made.data !== "string") return;
  if (!isAsset(made.asset) || kept.has(made.asset)) return;
  kept.add(made.asset);
  const key = made.asset;
  const mediaType = typeof made.mediaType === "string" ? made.mediaType : "image/png";
  const blob = new Blob([dataUrlBytes(`data:${mediaType};base64,${made.data}`).bytes], {
    type: mediaType,
  });
  const pending = toEmbeddable(blob)
    .then(async (file) => {
      await keepPicture(key, file, threadId);
      return file;
    })
    .catch((error: unknown) => {
      useAssetsStore.setState((s) => ({
        failed: { ...s.failed, [key]: error instanceof Error ? error.message : String(error) },
      }));
      return null;
    })
    .finally(() =>
      useAssetsStore.setState((s) => {
        const { [key]: _, ...loading } = s.loading;
        return { loading };
      }),
    );
  useAssetsStore.setState((s) => ({ loading: { ...s.loading, [key]: pending } }));
}
