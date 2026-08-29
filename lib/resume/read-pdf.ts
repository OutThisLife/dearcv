import { extractText, getDocumentProxy } from "unpdf";
import type { ResumeTheme } from "@/lib/resume/schema";

/**
 * Text and look, from one pass over the file.
 *
 * The look used to be the model's job, inferred from the extracted text —
 * which cannot work, because extraction is what throws the geometry away. By
 * the time the prompt asked whether the name was centered, every coordinate
 * that could answer had been dropped. So it is measured here instead, off the
 * page, before the text is flattened.
 */

/** How far off centre a heading can sit and still read as centred. */
const CENTRE_TOLERANCE = 0.05;

/** The name is up here. Below it, a wide heading is just a wide heading. */
const HEADER_BAND = 0.2;

type Pdf = Awaited<ReturnType<typeof getDocumentProxy>>;
type TextContent = Awaited<ReturnType<Awaited<ReturnType<Pdf["getPage"]>>["getTextContent"]>>;

type Run = { text: string; size: number; mid: number; y: number; family: string };

function readRuns(content: TextContent): Run[] {
  return content.items.flatMap((item) => {
    if (!("str" in item) || !item.str.trim()) return [];

    const [a, , , d, x, y] = item.transform;
    return {
      text: item.str,
      // Vertical scale carries the size unless the run is rotated, where the
      // horizontal one is all that is left.
      size: Math.abs(d) || Math.abs(a),
      mid: x + item.width / 2,
      y,
      family: content.styles[item.fontName]?.fontFamily ?? "",
    };
  });
}

function readFont(runs: Run[]): ResumeTheme["font"] {
  const weight = new Map<string, number>();
  for (const run of runs) {
    // By characters, not by runs: one heading in another face should not
    // outvote the body it sits above.
    weight.set(run.family, (weight.get(run.family) ?? 0) + run.text.length);
  }

  const [family] = [...weight.entries()].sort((one, two) => two[1] - one[1])[0] ?? [""];
  if (/serif/i.test(family) && !/sans/i.test(family)) return "serif";
  if (/mono/i.test(family)) return "mono";
  return "sans";
}

function readHeader(runs: Run[], width: number, height: number): ResumeTheme["header"] {
  const band = runs.filter((run) => run.y > height * (1 - HEADER_BAND));
  if (!band.length) return "split";

  // The biggest thing at the top of a resume is the person's name.
  const largest = band.reduce((best, run) => (run.size > best.size ? run : best));
  const off = Math.abs(largest.mid - width / 2) / width;

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

  const result = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;

  const page = await pdf.getPage(1);
  const { width, height } = page.getViewport({ scale: 1 });
  const runs = readRuns(await page.getTextContent());

  return {
    text,
    look: {
      font: readFont(runs),
      header: readHeader(runs, width, height),
    } satisfies Partial<ResumeTheme>,
  };
}
