import {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Image,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Svg,
  Text as SvgText,
  Tspan,
  View,
} from "@react-pdf/renderer";
import type { ComponentType, ReactNode } from "react";
import { type Art, layerOf, parseSvg, strokeAlpha, strokePath, type SvgNode } from "./art";
import { FACES } from "./fonts";
import { boxIds } from "./pdf-boxes";

/**
 * The art on a resume, drawn into the PDF. Each piece is an absolutely placed
 * box tagged with its id, so the preview can find it on the page like any
 * other part — to flash it when it changes, and to let it be picked up and
 * moved.
 *
 * A piece on a page is drawn by a fixed layer that renders on every page and
 * keeps only the pieces for the page it is on; a piece pinned to a part of
 * the resume is drawn inside that part, so it rides along when the text
 * reflows.
 */

/**
 * The pictures the art shows, resolved before the document is drawn: by
 * asset id or URL, a data URL for a raster picture, or the markup of an SVG.
 */
export type ArtFiles = Record<string, string>;

/** react-pdf's element for each SVG tag we draw. */
const ELEMENTS: Record<string, ComponentType<Record<string, unknown>>> = {
  g: G as never,
  path: Path as never,
  rect: Rect as never,
  circle: Circle as never,
  ellipse: Ellipse as never,
  line: Line as never,
  polyline: Polyline as never,
  polygon: Polygon as never,
  text: SvgText as never,
  tspan: Tspan as never,
  defs: Defs as never,
  clippath: ClipPath as never,
  lineargradient: LinearGradient as never,
  radialgradient: RadialGradient as never,
  stop: Stop as never,
};

/**
 * Numbers where react-pdf wants numbers, everything else as written. Its own
 * prop parsing turns most geometry strings into numbers, but not `points` or
 * the attributes it reads straight off a `<text>`.
 */
const NUMERIC =
  /^(x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|fx|fy|width|height|strokeWidth|opacity|fillOpacity|strokeOpacity|stopOpacity|strokeMiterlimit|fontSize|letterSpacing)$/;

/** CSS colour words react-pdf doesn't know, as the ones it does. */
const COLOR_WORDS: Record<string, string> = { transparent: "none" };

/** The faces an SVG's text can be set in: the ones the page has, by what a drawing names. */
const SVG_FACES: [RegExp, string][] = [
  [/script|cursive|hand|vibes|brush/i, "Signature"],
  [/mono|courier|code/i, "Courier"],
  [/serif|times|georgia|garamond|playfair|lora|merriweather/i, "Times-Roman"],
];

/**
 * A family an SVG names, as one react-pdf has. A drawing written for a
 * browser names whatever it likes; an unregistered family stops the whole
 * page drawing, so anything we don't have falls back by kind.
 */
function svgFont(family: string, weight: unknown) {
  const name = family.split(",")[0]!.replace(/["']/g, "").trim();
  const face = FACES.find((one) => one.id === name.toLowerCase().replace(/\s+/g, "-"));
  if (face && !face.builtin) return name.toLowerCase().replace(/\s+/g, "-");
  const bold = weight === "bold" || (typeof weight === "number" && weight >= 600);
  const kind = SVG_FACES.find(([test]) => test.test(family) && !/sans/i.test(family))?.[1];
  if (kind === "Signature") return kind;
  if (kind === "Courier") return bold ? "Courier-Bold" : "Courier";
  if (kind === "Times-Roman") return bold ? "Times-Bold" : "Times-Roman";
  return bold ? "Helvetica-Bold" : "Helvetica";
}

function props(attrs: Record<string, string>, strokes: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(attrs)) {
    const value = raw.trim();
    if (NUMERIC.test(key) && /^-?[\d.]+(px|pt)?$/.test(value)) out[key] = parseFloat(value);
    else if ((key === "fill" || key === "stroke") && COLOR_WORDS[value])
      out[key] = COLOR_WORDS[value];
    // react-pdf fills with a gradient but can't stroke with one, and strokes
    // black instead; its middle colour is the nearest thing it can draw.
    else if (key === "stroke" && value.startsWith("url("))
      out[key] = strokes[value.match(/#([^)'"\s]+)/)?.[1] ?? ""] ?? "none";
    else if (key === "fontWeight" && /^\d+$/.test(value)) out[key] = Number(value);
    else out[key] = value;
  }
  if (typeof out.fontFamily === "string") {
    out.fontFamily = svgFont(out.fontFamily, out.fontWeight);
    // The standard faces carry their weight in their name.
    if (/^(Helvetica|Times|Courier)/.test(out.fontFamily as string)) delete out.fontWeight;
  }
  return out;
}

/** Each gradient's middle stop colour, by id, for a stroke that names one. */
function gradientColors(node: SvgNode, out: Record<string, string> = {}) {
  if (node.tag.endsWith("gradient") && node.attrs.id) {
    const stops = node.children.filter(
      (child): child is SvgNode => typeof child !== "string" && child.tag === "stop",
    );
    const stop = stops[Math.floor((stops.length - 1) / 2)];
    const color = stop?.attrs.stopColor ?? stop?.attrs.style?.match(/stop-color:\s*([^;]+)/)?.[1];
    if (color) out[node.attrs.id] = color.trim();
  }
  for (const child of node.children) if (typeof child !== "string") gradientColors(child, out);
  return out;
}

function drawNode(strokes: Record<string, string>) {
  const draw = (node: SvgNode | string, key: number): ReactNode => {
    if (typeof node === "string") return node;
    const Element = ELEMENTS[node.tag];
    if (!Element) return null;
    return (
      <Element key={key} {...props(node.attrs, strokes)}>
        {node.children.length ? node.children.map(draw) : undefined}
      </Element>
    );
  };
  return draw;
}

function Drawing({
  markup,
  width,
  height,
  color,
  fit,
  opacity,
}: {
  markup: string;
  width: number;
  height: number;
  color: string;
  fit?: Art["fit"];
  opacity?: number;
}) {
  // One-colour icons draw in currentColor; here that is the piece's colour.
  const tree = parseSvg(markup.replace(/currentColor/g, color));
  if (!tree) return null;
  const children = tree.children.map(drawNode(gradientColors(tree)));
  return (
    <Svg
      viewBox={tree.attrs.viewBox ?? `0 0 ${width} ${height}`}
      preserveAspectRatio={
        (tree.attrs.preserveAspectRatio as never) ??
        (fit === "cover" ? "xMidYMid slice" : "xMidYMid meet")
      }
      style={{ position: "absolute", left: 0, top: 0, width, height }}
    >
      {opacity === undefined ? children : <G opacity={opacity}>{children}</G>}
    </Svg>
  );
}

/** Pen and highlighter lines, drawn in the piece's own points. */
function Strokes({ piece, opacity = 1 }: { piece: Art; opacity?: number }) {
  if (!piece.strokes?.length) return null;
  return (
    <Svg
      viewBox={`0 0 ${piece.width} ${piece.height}`}
      style={{ position: "absolute", left: 0, top: 0, width: piece.width, height: piece.height }}
    >
      {piece.strokes.map((stroke, i) => (
        <Path
          key={i}
          d={strokePath(stroke)}
          fill={stroke.color}
          fillOpacity={strokeAlpha(stroke) * opacity}
        />
      ))}
    </Svg>
  );
}

function Picture({ piece, art, opacity }: { piece: Art; art: ArtSet; opacity?: number }) {
  const src = piece.image && art.files[piece.image];
  if (!src) return null;
  // An SVG picture is drawn as vectors, from its markup, which also keeps it
  // crisp in the saved file.
  if (src.startsWith("<")) {
    return (
      <Drawing
        markup={src}
        width={piece.width}
        height={piece.height}
        color={piece.color ?? art.accent}
        fit={piece.fit}
        opacity={opacity}
      />
    );
  }
  return (
    <Image
      src={src}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: piece.width,
        height: piece.height,
        objectFit: piece.fit ?? "contain",
        ...(opacity === undefined ? {} : { opacity }),
      }}
    />
  );
}

export function ArtPiece({ piece, art }: { piece: Art; art: ArtSet }) {
  // A View's opacity reaches only its own background in react-pdf, never
  // what is drawn inside it, so each kind of content carries it itself.
  const opacity = piece.opacity !== undefined && piece.opacity < 1 ? piece.opacity : undefined;
  return (
    <View
      id={boxIds.art(piece.id)}
      style={{
        position: "absolute",
        left: piece.x,
        top: piece.y,
        width: piece.width,
        height: piece.height,
        ...(piece.rotate ? { transform: `rotate(${piece.rotate}deg)` } : {}),
        ...(piece.radius ? { borderRadius: piece.radius, overflow: "hidden" as const } : {}),
      }}
    >
      {piece.svg ? (
        <Drawing
          markup={piece.svg}
          width={piece.width}
          height={piece.height}
          color={piece.color ?? art.accent}
          fit={piece.fit}
          opacity={opacity}
        />
      ) : null}
      <Picture piece={piece} art={art} opacity={opacity} />
      <Strokes piece={piece} opacity={opacity} />
    </View>
  );
}

/**
 * Everything the page's art needs to draw: the pieces, the pictures they
 * show, the colour a one-colour icon takes when it names none, and the
 * height of a page, which is how far down the flow page two begins.
 */
export type ArtSet = { pieces: Art[]; files: ArtFiles; accent: string; pageHeight: number };

/**
 * The pieces on pages, for one layer: absolute boxes laid straight on the
 * page, a later page's pushed down by the pages before it, so pagination
 * carries each to the page it names (our layout patch keeps a placed box
 * whole and on the page its top falls on). Behind goes first among the
 * page's children and front last, so each lands on its side of the text.
 *
 * Not a fixed `render` layer: react-pdf lays a render prop's output out
 * without resolving SVG, so every viewBox, gradient and line of text in a
 * drawing was lost there.
 */
export function PageArt({ art, layer }: { art: ArtSet; layer: "behind" | "front" }) {
  return art.pieces
    .filter((piece) => !piece.anchor && layerOf(piece) === layer)
    .map((piece) => (
      <ArtPiece
        key={piece.id}
        piece={{ ...piece, y: piece.y + ((piece.page ?? 1) - 1) * art.pageHeight }}
        art={art}
      />
    ));
}

/**
 * The pieces pinned to one part of the resume, drawn inside it. Behind goes
 * first in the part and front last, so each lands on the right side of its
 * text.
 */
export function AnchoredArt({
  art,
  anchor,
  layer,
}: {
  art?: ArtSet;
  anchor: string;
  layer: "behind" | "front";
}) {
  if (!art) return null;
  return art.pieces
    .filter((piece) => piece.anchor === anchor && layerOf(piece) === layer)
    .map((piece) => <ArtPiece key={piece.id} piece={piece} art={art} />);
}
