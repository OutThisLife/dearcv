/**
 * Typefaces a carried-over resume can be set in. The first group are metric
 * twins of the faces Word and Google Docs resumes are usually set in — same
 * widths, so a line breaks where it broke in the original — and the rest are
 * the open families people pick on purpose. All are open-licensed and served
 * from /fonts (Latin subset, via Fontsource), so nothing is fetched from a
 * third party at render time.
 *
 * Helvetica, Times and Courier are the PDF standard faces: always available,
 * never downloaded, and what a document built from scratch uses.
 */
export type Face = {
  id: string;
  generic: "sans" | "serif" | "mono";
  /** Tested against the family name embedded in the uploaded PDF. */
  match?: RegExp;
  /** Standard PDF faces, by style. Absent means the files live in /fonts/<id>. */
  builtin?: { regular: string; bold: string; italic: string; boldItalic: string };
};

export const FACES: Face[] = [
  {
    id: "helvetica",
    generic: "sans",
    builtin: {
      regular: "Helvetica",
      bold: "Helvetica-Bold",
      italic: "Helvetica-Oblique",
      boldItalic: "Helvetica-BoldOblique",
    },
  },
  {
    id: "times",
    generic: "serif",
    builtin: {
      regular: "Times-Roman",
      bold: "Times-Bold",
      italic: "Times-Italic",
      boldItalic: "Times-BoldItalic",
    },
  },
  {
    id: "courier",
    generic: "mono",
    builtin: {
      regular: "Courier",
      bold: "Courier-Bold",
      italic: "Courier-Oblique",
      boldItalic: "Courier-BoldOblique",
    },
  },
  { id: "gelasio", generic: "serif", match: /georgia|gelasio/i },
  { id: "tinos", generic: "serif", match: /times|tinos|liberation ?serif/i },
  { id: "arimo", generic: "sans", match: /arial|helvetica|arimo|liberation ?sans/i },
  { id: "carlito", generic: "sans", match: /calibri|carlito/i },
  { id: "caladea", generic: "serif", match: /cambria|caladea/i },
  { id: "cousine", generic: "mono", match: /courier|cousine|liberation ?mono/i },
  { id: "eb-garamond", generic: "serif", match: /garamond/i },
  { id: "inter", generic: "sans", match: /^inter\b/i },
  { id: "roboto", generic: "sans", match: /roboto/i },
  { id: "lato", generic: "sans", match: /lato/i },
  { id: "open-sans", generic: "sans", match: /open ?sans/i },
  { id: "source-sans-3", generic: "sans", match: /source ?sans/i },
  { id: "source-serif-4", generic: "serif", match: /source ?serif/i },
  { id: "merriweather", generic: "serif", match: /merriweather/i },
  { id: "lora", generic: "serif", match: /^lora/i },
  { id: "montserrat", generic: "sans", match: /montserrat/i },
  { id: "raleway", generic: "sans", match: /raleway/i },
];

const BY_ID = new Map(FACES.map((face) => [face.id, face]));

/** The face a document without a measured look uses, by the theme's generic choice. */
export const STANDARD_FACE = { sans: "helvetica", serif: "times", mono: "courier" } as const;

/**
 * The closest face we ship to the one embedded in the PDF. An unknown family
 * falls back by kind — its own name usually says serif or sans — to a metric
 * twin rather than a standard face, since those break lines the same way.
 */
export function faceFor(embedded: string, generic: Face["generic"]) {
  const known = FACES.find((face) => face.match?.test(embedded));
  if (known) return known.id;
  return { sans: "arimo", serif: "tinos", mono: "cousine" }[generic];
}

export const genericOf = (id: string) => BY_ID.get(id)?.generic ?? "sans";

/** What react-pdf needs to set a run in a face, bold and italic resolved. */
export function faceStyle(id: string, bold: boolean, italic: boolean) {
  const face = BY_ID.get(id) ?? BY_ID.get("helvetica")!;
  if (face.builtin) {
    const key = bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
    return { fontFamily: face.builtin[key] };
  }
  return {
    fontFamily: face.id,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? ("italic" as const) : ("normal" as const),
  };
}
