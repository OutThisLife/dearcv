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

function drawGrid(ctx: CanvasRenderingContext2D, scale: number, width: number, height: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(220, 40, 120, 0.22)";
  ctx.fillStyle = "rgba(200, 30, 100, 0.85)";
  ctx.lineWidth = 1;
  ctx.font = "11px Helvetica, Arial, sans-serif";
  for (let pt = 50; pt < width / scale; pt += 50) {
    const x = Math.round(pt * scale) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    if (pt % 100 === 0) ctx.fillText(String(pt), x + 2, 11);
  }
  for (let pt = 50; pt < height / scale; pt += 50) {
    const y = Math.round(pt * scale) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    if (pt % 100 === 0) ctx.fillText(String(pt), 2, y - 2);
  }
  ctx.restore();
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
