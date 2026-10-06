import { z } from "zod";
import { getStroke } from "@/lib/vendor/perfect-freehand/getStroke";
import type { StrokeOptions } from "@/lib/vendor/perfect-freehand/types";

/**
 * Everything on the page that isn't text: a drawing, a picture, a stroke of a
 * pen. Each piece sits in a box of its own, either on a page or pinned to a
 * part of the resume so it travels with that part when the text reflows, and
 * either behind the type or in front of it.
 *
 * Coordinates are PDF points: from the page's top-left, or from the top-left
 * of the part it is pinned to.
 */

export const artStrokeSchema = z.object({
  points: z
    .array(z.array(z.number()).min(2).max(3))
    .min(1)
    .describe(
      "[x, y] or [x, y, pressure 0–1], in points inside the piece's box, in drawing order.",
    ),
  size: z.number().positive().describe("Nib width in points: 1.5–4 for a pen, 8–18 for a marker."),
  color: z.string(),
  marker: z
    .boolean()
    .optional()
    .describe("A flat, see-through highlighter band rather than a pen line shaped by pressure."),
});

export const artSchema = z.object({
  id: z.string().describe("Stable kebab-case id."),
  label: z.string().describe("What it is, in a few words: 'banana sticker', 'wavy divider'."),
  svg: z
    .string()
    .optional()
    .describe('A vector drawing: complete <svg viewBox="…">…</svg> markup, drawn to fill the box.'),
  image: z
    .string()
    .optional()
    .describe(
      "A picture: an asset id (from generate_image, or an image they attached), or the URL of a PNG, JPEG, WebP, GIF or SVG — from find_images or anywhere on the web.",
    ),
  source: z
    .string()
    .optional()
    .describe(
      "Where a found picture came from — its page, and its author and licence if it has one — kept for credit.",
    ),
  strokes: z
    .array(artStrokeSchema)
    .optional()
    .describe("Hand-drawn lines, shaped like a real pen's or a highlighter's."),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("The page it sits on, from 1. Not used when it is anchored."),
  anchor: z
    .string()
    .optional()
    .describe(
      "Pins it to a part of the resume so it moves with that part: 'basics', 'section:<id>' or 'item:<id>'. x and y are then measured from that part's top-left.",
    ),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotate: z.number().optional().describe("Degrees clockwise, about the box's centre."),
  opacity: z.number().min(0).max(1).optional(),
  color: z
    .string()
    .optional()
    .describe("Colour for a one-colour icon (its currentColor). The theme's accent by default."),
  radius: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Rounds the box's corners and clips what is in it: half its size makes a circle (a headshot).",
    ),
  fit: z
    .enum(["contain", "cover"])
    .optional()
    .describe(
      "For a picture: show all of it (contain, the default) or fill the box and crop (cover).",
    ),
  layer: z
    .enum(["behind", "front"])
    .optional()
    .describe(
      "Behind the text — backgrounds, washes, big shapes, highlighter — or in front of it: stickers, doodles, accents. Front by default.",
    ),
});

export type Art = z.infer<typeof artSchema>;
export type ArtStroke = z.infer<typeof artStrokeSchema>;

/** A picture's file, kept apart from the document so the history never copies it. */
export const ASSET = "asset:";

export const isAsset = (source: string) => source.startsWith(ASSET);

/** The asset ids and URLs a document's pictures need. */
export const artSources = (art: Art[] | undefined) => [
  ...new Set((art ?? []).flatMap((piece) => (piece.image ? [piece.image] : []))),
];

/** The page in points, by the size the theme asks for. */
export const PAGE_SIZE = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.28, height: 841.89 },
} as const;

export const layerOf = (piece: Art) => piece.layer ?? "front";

/**
 * perfect-freehand's settings for the two nibs. A pen thins with pressure,
 * or with speed when there is none, and tapers into its ends; a marker is a
 * flat band of even width.
 */
function strokeOptions(stroke: ArtStroke): StrokeOptions {
  const pressured = stroke.points.some((point) => point.length > 2);
  return stroke.marker
    ? { size: stroke.size, thinning: 0, smoothing: 0.5, streamline: 0.6, last: true }
    : {
        size: stroke.size,
        thinning: 0.55,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: !pressured,
        last: true,
      };
}

/** How see-through a stroke is laid down, before the piece's own opacity. */
export const strokeAlpha = (stroke: ArtStroke) => (stroke.marker ? 0.4 : 1);

const fixed = (n: number) => n.toFixed(2);

/**
 * A stroke's outline as SVG path data. Quadratic segments through the
 * midpoints of the outline, as perfect-freehand's own recipe draws it, each
 * spelled out in full so any path parser takes it. `scale` and the offsets
 * move it into another space — screen pixels, while it is being drawn.
 */
export function strokePath(stroke: ArtStroke, scale = 1, dx = 0, dy = 0) {
  const points = stroke.points.map(([x, y, pressure]) =>
    pressure === undefined
      ? [x * scale + dx, y * scale + dy]
      : [x * scale + dx, y * scale + dy, pressure],
  );
  const options = strokeOptions(stroke);
  const outline = getStroke(points, { ...options, size: stroke.size * scale });
  if (outline.length < 3) return "";

  const [x0, y0] = outline[0];
  let d = `M${fixed(x0)},${fixed(y0)}`;
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[(i + 1) % outline.length];
    d += ` Q${fixed(ax)},${fixed(ay)} ${fixed((ax + bx) / 2)},${fixed((ay + by) / 2)}`;
  }
  return `${d} Z`;
}

/** An SVG drawing, parsed down to the elements a PDF can draw. */
export type SvgNode = {
  tag: string;
  attrs: Record<string, string>;
  children: (SvgNode | string)[];
};

/**
 * What react-pdf can paint. Filters, masks, patterns and `use` are not on the
 * list: it has no way to draw them, so they are left out rather than drawn wrong.
 */
const DRAWABLE = new Set([
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "clippath",
  "lineargradient",
  "radialgradient",
  "stop",
]);

const camel = (name: string) =>
  name.replace(/[-:]([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** The root's own size is the piece's box, so of its attributes only the viewBox matters. */
const ROOT_KEEPS = /^(viewBox|preserveAspectRatio)$/;

/** Only a browser reads these; react-pdf would try to treat them as geometry. */
const BROWSER_ONLY = /^(class|style|xmlns.*|xml.*|version)$/;

function attributesOf(element: Element, root: boolean) {
  const attrs: Record<string, string> = {};
  for (const { name, value } of Array.from(element.attributes)) {
    const key = camel(name.toLowerCase() === "viewbox" ? "viewBox" : name);
    if (root ? !ROOT_KEEPS.test(key) : BROWSER_ONLY.test(key)) continue;
    attrs[key] = value;
  }
  if (root) return attrs;
  // Inline styles are how most exported SVG sets its colours.
  for (const declaration of element.getAttribute("style")?.split(";") ?? []) {
    const at = declaration.indexOf(":");
    if (at < 0) continue;
    const key = declaration.slice(0, at).trim();
    const value = declaration.slice(at + 1).trim();
    if (key && value) attrs[camel(key)] = value;
  }
  return attrs;
}

function walk(element: Element, dropped: Set<string>): SvgNode | null {
  const tag = element.tagName.toLowerCase();
  if (!DRAWABLE.has(tag)) {
    if (!/^(title|desc|metadata|style)$/.test(tag)) dropped.add(tag);
    return null;
  }
  const children: SvgNode["children"] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) {
      const text = child.textContent?.replace(/\s+/g, " ").trim();
      if (text && (tag === "text" || tag === "tspan")) children.push(text);
    } else if (child.nodeType === 1) {
      const node = walk(child as Element, dropped);
      if (node) children.push(node);
    }
  }
  return { tag, attrs: attributesOf(element, false), children };
}

type Parsed = { tree: SvgNode | null; dropped: string[] };
const parsed = new Map<string, Parsed>();

/**
 * The drawing inside an <svg>, and which of its elements could not be kept.
 * Read with the browser's own parser, which forgives far more of what a model
 * or an icon set writes than a strict XML one would.
 */
export function readSvg(markup: string): Parsed {
  const known = parsed.get(markup);
  if (known) return known;
  if (typeof DOMParser === "undefined") return { tree: null, dropped: [] };

  const strict = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root =
    strict.querySelector("parsererror") === null
      ? strict.querySelector("svg")
      : new DOMParser().parseFromString(markup, "text/html").querySelector("svg");
  const dropped = new Set<string>();
  let tree: SvgNode | null = null;
  if (root) {
    const attrs = attributesOf(root, true);
    const width = parseFloat(root.getAttribute("width") ?? "");
    const height = parseFloat(root.getAttribute("height") ?? "");
    if (!attrs.viewBox && width > 0 && height > 0) attrs.viewBox = `0 0 ${width} ${height}`;
    const children = Array.from(root.children)
      .map((child) => walk(child, dropped))
      .filter((node): node is SvgNode => node !== null);
    if (children.length) tree = { tag: "svg", attrs, children };
  }

  const result = { tree, dropped: [...dropped] };
  if (parsed.size > 200) parsed.clear();
  parsed.set(markup, result);
  return result;
}

export const parseSvg = (markup: string) => readSvg(markup).tree;

/** Height over width of an SVG, from its viewBox. */
export function svgAspect(node: SvgNode) {
  const [, , width, height] = (node.attrs.viewBox ?? "").split(/[\s,]+/).map(Number);
  return width > 0 && height > 0 ? height / width : undefined;
}

/** What the model is shown of a piece: everything but the bulk it already wrote. */
export function artForModel(piece: Art) {
  const { svg, strokes, ...rest } = piece;
  return {
    ...rest,
    ...(svg ? { svg: `(${svg.length} characters of SVG — send svg again only to redraw it)` } : {}),
    ...(strokes
      ? {
          strokes: `(${strokes.length} hand-drawn ${strokes.length === 1 ? "line" : "lines"}, ${strokes[0]?.marker ? "highlighter" : "pen"} in ${strokes[0]?.color})`,
        }
      : {}),
  };
}
