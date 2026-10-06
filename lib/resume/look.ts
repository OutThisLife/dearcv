import { type PdfBoxes } from "@/lib/resume/pdf-boxes";

/**
 * The drawn page as pictures, for the model to look at: one JPEG per page,
 * small enough to be cheap and large enough to judge spacing and overlaps.
 * Painted off the same PDF the pane shows, so what the model sees is what
 * prints. `grid` rules a light 50pt grid with the edges labelled, so the
 * model can read positions off the picture in the same points it places in.
 */

const WIDTH_PX = 900;

export type PageShot = { base64: string; mediaType: "image/jpeg"; page: number };

/** A part of one page to look at closely, in page points. */
export type Region = { page: number; x: number; y: number; width: number; height: number };

/** How much room to leave around a part when looking at it, in points. */
const MARGIN_PT = 18;
/** A close look fills this, however small the part: a sticker gets real detail. */
const CLOSE_PX = 900;
/** And never magnifies past this, where it would only show the pixels. */
const MAX_SCALE = 4;

function drawGrid(
  ctx: CanvasRenderingContext2D,
  scale: number,
  width: number,
  height: number,
  origin = { x: 0, y: 0 },
) {
  ctx.save();
  ctx.strokeStyle = "rgba(220, 40, 120, 0.22)";
  ctx.fillStyle = "rgba(200, 30, 100, 0.85)";
  ctx.lineWidth = 1;
  ctx.font = "11px Helvetica, Arial, sans-serif";
  // Close up, every 10pt; whole pages, every 50. Labels on every other line,
  // in page points, so a crop reads in the same numbers as the page.
  const step = scale > 2 ? 10 : 50;
  const firstX = Math.ceil(origin.x / step) * step;
  for (let pt = firstX; pt < origin.x + width / scale; pt += step) {
    const x = Math.round((pt - origin.x) * scale) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    if (pt % (step * 2) === 0 && x > 16) ctx.fillText(String(pt), x + 2, 11);
  }
  const firstY = Math.ceil(origin.y / step) * step;
  for (let pt = firstY; pt < origin.y + height / scale; pt += step) {
    const y = Math.round((pt - origin.y) * scale) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    if (pt % (step * 2) === 0 && y > 16) ctx.fillText(String(pt), 2, y - 2);
  }
  ctx.restore();
}

/**
 * One part of a page, close up: cropped to the part with a little room around
 * it and drawn large, so a small sticker or a line of text is checked in
 * detail for a fraction of what three whole pages cost.
 */
export async function shootRegion(url: string, region: Region, grid = false) {
  const { getDocumentProxy } = await import("unpdf");
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const pdf = await getDocumentProxy(bytes);
  try {
    const page = await pdf.getPage(Math.min(Math.max(region.page, 1), pdf.numPages));
    const base = page.getViewport({ scale: 1 });
    const x = Math.max(0, region.x - MARGIN_PT);
    const y = Math.max(0, region.y - MARGIN_PT);
    const width = Math.min(base.width, region.x + region.width + MARGIN_PT) - x;
    const height = Math.min(base.height, region.y + region.height + MARGIN_PT) - y;
    const scale = Math.min(MAX_SCALE, CLOSE_PX / Math.max(width, height));
    const viewport = page.getViewport({ scale, offsetX: -x * scale, offsetY: -y * scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    if (grid) drawGrid(ctx, scale, canvas.width, canvas.height, { x, y });
    const data = canvas.toDataURL("image/jpeg", 0.85);
    return {
      shot: {
        base64: data.slice(data.indexOf(",") + 1),
        mediaType: "image/jpeg" as const,
        page: region.page,
      },
      shown: {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      },
    };
  } finally {
    await pdf.cleanup();
  }
}

export async function shootPages(
  url: string,
  options: { pages?: number[]; grid?: boolean } = {},
): Promise<PageShot[]> {
  const { getDocumentProxy } = await import("unpdf");
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const pdf = await getDocumentProxy(bytes);
  const shots: PageShot[] = [];
  try {
    const wanted = options.pages?.length
      ? options.pages.filter((n) => n >= 1 && n <= pdf.numPages)
      : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    for (const n of wanted.slice(0, 3)) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = WIDTH_PX / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      if (options.grid) drawGrid(ctx, scale, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.82);
      shots.push({ base64: data.slice(data.indexOf(",") + 1), mediaType: "image/jpeg", page: n });
    }
  } finally {
    await pdf.cleanup();
  }
  return shots;
}

/**
 * Where everything sits, in words the model can place against: each part's
 * box in page points, and the page's own size and margins. Rounded, since a
 * tenth of a point is noise to anyone placing a sticker.
 */
export function describeLayout(
  boxes: PdfBoxes,
  names: Record<string, string>,
): {
  id: string;
  name?: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}[] {
  return Object.entries(boxes)
    .filter(([id]) => id !== "page")
    .map(([id, box]) => ({
      id,
      ...(names[id] ? { name: names[id] } : {}),
      page: box.page + 1,
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    }));
}
