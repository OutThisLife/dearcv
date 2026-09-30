import { extractText, getDocumentProxy } from "unpdf";
import type { ResumeTheme } from "@/lib/resume/schema";

/**
 * Text and layout, from one pass over the file.
 *
 * The look used to be the model's job, inferred from extracted text — which
 * cannot work, because extraction is what throws the geometry away. So the
 * page is read here instead, before the text is flattened: every run of text
 * with its face, size, colour and position, and every thin rule drawn on the
 * page. What those runs *are* — a name, a heading, a job title — is only known
 * once the content has been transcribed, so matching them up happens later
 * (measure-typeset.ts), against the transcription.
 */

export type LayoutRun = {
  page: number;
  text: string;
  /** Left edge and baseline, in points, y up from the bottom of the page. */
  x: number;
  y: number;
  width: number;
  size: number;
  /** The face as embedded, subset prefix and style suffix stripped. */
  family: string;
  bold: boolean;
  italic: boolean;
  color: string;
};

export type LayoutRule = {
  page: number;
  x1: number;
  x2: number;
  y: number;
  thickness: number;
  color: string;
};

/** A small filled shape: how a browser or Word draws a list bullet. */
export type LayoutMark = {
  page: number;
  /** Centre, in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  round: boolean;
};

export type PdfLayout = {
  width: number;
  height: number;
  runs: LayoutRun[];
  rules: LayoutRule[];
  marks: LayoutMark[];
};

/** How far off centre a heading can sit and still read as centred. */
const CENTRE_TOLERANCE = 0.05;

/** The name is up here. Below it, a wide heading is just a wide heading. */
const HEADER_BAND = 0.2;

/** Pages past this are not worth measuring; a resume's look is set on page one. */
const MEASURED_PAGES = 3;

type Pdf = Awaited<ReturnType<typeof getDocumentProxy>>;
type Page = Awaited<ReturnType<Pdf["getPage"]>>;
type Matrix = [number, number, number, number, number, number];

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const apply = (m: Matrix, x: number, y: number) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** "BAAAAA+Georgia-BoldItalic" → Georgia, bold, italic. */
export function parseFontName(raw: string) {
  const name = raw.replace(/^[A-Z]{6}\+/, "");
  const bold = /bold|black|heavy|semibold|demi|extrabold/i.test(name);
  const italic = /italic|oblique|(?:^|[-,])it$/i.test(name);
  const family = name
    .replace(
      /[-,](?:bold|black|heavy|semibold|demibold|demi|extrabold|italic|oblique|regular|roman|book|medium|light|it|boldit|bolditalic|boldoblique)+$/i,
      "",
    )
    .replace(/(?:PSMT|PS|MT)$/, "")
    .replace(/[-_,]+$/, "");
  return { family: family || name, bold, italic };
}

type Styled = { color: string; chars: string };

/**
 * One walk over the drawing instructions, for the two things text content
 * leaves out: the colour each glyph was filled with, and the lines drawn
 * between sections.
 */
async function readOps(page: Page, OPS: Record<string, number>, pageNo: number) {
  const list = await page.getOperatorList();
  const stack: { ctm: Matrix; fill: string; stroke: string; lineWidth: number }[] = [];
  let state = {
    ctm: [1, 0, 0, 1, 0, 0] as Matrix,
    fill: "#000000",
    stroke: "#000000",
    lineWidth: 1,
  };
  const glyphs: Styled[] = [];
  const rules: LayoutRule[] = [];
  const marks: LayoutMark[] = [];

  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i] as unknown[];
    switch (fn) {
      case OPS.save:
        stack.push({ ...state });
        break;
      case OPS.restore:
        state = stack.pop() ?? state;
        break;
      case OPS.transform:
        state = { ...state, ctm: multiply(state.ctm, args as Matrix) };
        break;
      case OPS.setFillRGBColor:
        state = { ...state, fill: String(args[0]) };
        break;
      case OPS.setStrokeRGBColor:
        state = { ...state, stroke: String(args[0]) };
        break;
      case OPS.setLineWidth:
        state = { ...state, lineWidth: Number(args[0]) };
        break;
      case OPS.setGState: {
        const width = (args[0] as [string, unknown][]).find(([key]) => key === "LW");
        if (width) state = { ...state, lineWidth: Number(width[1]) };
        break;
      }
      case OPS.showText: {
        const chars = (args[0] as { unicode?: string }[])
          .map((glyph) => (typeof glyph === "object" && glyph?.unicode) || "")
          .join("");
        if (chars) glyphs.push({ color: state.fill, chars });
        break;
      }
      case OPS.constructPath: {
        const [paint, paths] = args as [number, ArrayLike<number>[] | ArrayLike<number>];
        const stroked = paint === OPS.stroke || paint === OPS.closeStroke;
        const filled = paint === OPS.fill || paint === OPS.eoFill;
        if (!stroked && !filled) break;

        const data = Array.from((Array.isArray(paths) ? paths[0] : paths) ?? []);
        const points: number[][] = [];
        let curved = false;
        // Encoded as [op, ...coords]: 0 move, 1 line, 2 curve (six), 4 close.
        for (let at = 0; at < data.length;) {
          const op = data[at];
          const take = op === 2 ? 6 : op === 4 ? 0 : 2;
          if (op === 2) curved = true;
          for (let k = 0; k < take; k += 2)
            points.push(apply(state.ctm, data[at + 1 + k], data[at + 2 + k]));
          at += 1 + take;
        }
        if (points.length < 2) break;

        const xs = points.map((p) => p[0]);
        const ys = points.map((p) => p[1]);
        const width = Math.max(...xs) - Math.min(...xs);
        const tall = Math.max(...ys) - Math.min(...ys);
        if (filled && width > 0.5 && width < 9 && tall > 0.3 && tall < 9) {
          marks.push({
            page: pageNo,
            x: (Math.max(...xs) + Math.min(...xs)) / 2,
            y: (Math.max(...ys) + Math.min(...ys)) / 2,
            width,
            height: tall,
            round: curved,
          });
          break;
        }
        const scale = Math.hypot(state.ctm[0], state.ctm[1]);
        const thickness = stroked ? state.lineWidth * scale : Math.max(...ys) - Math.min(...ys);
        // A rule is long and thin. Boxes, backgrounds and glyph-like marks are not.
        if (width < 40 || thickness <= 0 || thickness > 6) break;

        // The CTM already lands in the page's user space, y up — the same
        // space text content reports its baselines in.
        rules.push({
          page: pageNo,
          x1: Math.min(...xs),
          x2: Math.max(...xs),
          y: (Math.max(...ys) + Math.min(...ys)) / 2,
          thickness: Math.round(thickness * 100) / 100,
          color: stroked ? state.stroke : state.fill,
        });
        break;
      }
    }
  });

  return { glyphs, rules, marks };
}

/**
 * Hands each text-content item the colour its characters were drawn in. The
 * two lists describe the same text in the same order but are cut differently,
 * so they are walked together a character at a time, spaces ignored.
 */
function colourRuns(items: { str: string }[], glyphs: Styled[]) {
  const stream: string[] = [];
  const colours: string[] = [];
  for (const glyph of glyphs) {
    for (const char of glyph.chars) {
      if (/\s/.test(char)) continue;
      stream.push(char);
      colours.push(glyph.color);
    }
  }

  let at = 0;
  return items.map((item) => {
    const tally = new Map<string, number>();
    for (const char of item.str) {
      if (/\s/.test(char)) continue;
      // Resync on a mismatch rather than drifting for the rest of the page.
      let probe = at;
      while (probe < stream.length && probe - at < 40 && stream[probe] !== char) probe += 1;
      if (stream[probe] !== char) continue;
      tally.set(colours[probe], (tally.get(colours[probe]) ?? 0) + 1);
      at = probe + 1;
    }
    return [...tally.entries()].sort((one, two) => two[1] - one[1])[0]?.[0] ?? "#000000";
  });
}

async function readPage(page: Page, pageNo: number, OPS: Record<string, number>) {
  const { glyphs, rules, marks } = await readOps(page, OPS, pageNo);
  const content = await page.getTextContent();
  const items = content.items.filter(
    (
      item,
    ): item is (typeof content.items)[number] & {
      str: string;
      transform: number[];
      width: number;
      fontName: string;
    } => "str" in item && Boolean(item.str.trim()),
  );
  const colours = colourRuns(items, glyphs);

  const runs = items.map((item, i): LayoutRun => {
    const [a, , , d, x, y] = item.transform;
    let face = "";
    try {
      face = (page.commonObjs.get(item.fontName) as { name?: string } | undefined)?.name ?? "";
    } catch {
      // Not every font object resolves; the style's generic family stands in.
    }
    const parsed = parseFontName(face || content.styles[item.fontName]?.fontFamily || "");
    return {
      page: pageNo,
      text: item.str,
      x,
      y,
      width: item.width,
      // Vertical scale carries the size unless the run is rotated, where the
      // horizontal one is all that is left.
      size: Math.round((Math.abs(d) || Math.abs(a)) * 100) / 100,
      ...parsed,
      color: colours[i],
    };
  });

  return { runs, rules, marks };
}

function readFont(runs: LayoutRun[]): ResumeTheme["font"] {
  const weight = new Map<string, number>();
  for (const run of runs) {
    // By characters, not by runs: one heading in another face should not
    // outvote the body it sits above.
    weight.set(run.family, (weight.get(run.family) ?? 0) + run.text.length);
  }

  const [family] = [...weight.entries()].sort((one, two) => two[1] - one[1])[0] ?? [""];
  if (/mono|courier|consol/i.test(family)) return "mono";
  if (
    /sans|arial|helvet|calibri|inter|roboto|lato|open|source|montserrat|aptos|verdana/i.test(family)
  )
    return "sans";
  if (/serif|times|georgia|garamond|cambria|book|merriweather|lora|palatino/i.test(family))
    return "serif";
  return "sans";
}

function readHeader(runs: LayoutRun[], width: number, height: number): ResumeTheme["header"] {
  const band = runs.filter((run) => run.page === 1 && run.y > height * (1 - HEADER_BAND));
  if (!band.length) return "split";

  // The biggest thing at the top of a resume is the person's name.
  const largest = band.reduce((best, run) => (run.size > best.size ? run : best));
  const off = Math.abs(largest.x + largest.width / 2 - width / 2) / width;

  return off < CENTRE_TOLERANCE ? "centered" : "split";
}

export async function readPdf(data: ArrayBuffer | Uint8Array) {
  // A Node Buffer passes `instanceof Uint8Array` and is then rejected further
  // down, so take a plain view rather than trusting the check.
  const bytes =
    data instanceof Uint8Array
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
  const pdf = await getDocumentProxy(bytes);
  const { OPS } = await import("unpdf/pdfjs");

  const result = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;

  const first = await pdf.getPage(1);
  const { width, height } = first.getViewport({ scale: 1 });
  const layout: PdfLayout = { width, height, runs: [], rules: [], marks: [] };
  for (let n = 1; n <= Math.min(pdf.numPages, MEASURED_PAGES); n += 1) {
    const { runs, rules, marks } = await readPage(n === 1 ? first : await pdf.getPage(n), n, OPS);
    layout.runs.push(...runs);
    layout.rules.push(...rules);
    layout.marks.push(...marks);
  }

  return {
    text,
    layout,
    look: {
      font: readFont(layout.runs),
      header: readHeader(layout.runs, width, height),
      page: Math.abs(width - 595) < 4 ? "a4" : "letter",
    } satisfies Partial<ResumeTheme>,
  };
}
