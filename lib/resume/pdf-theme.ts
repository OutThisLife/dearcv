import { Font, StyleSheet } from "@react-pdf/renderer";
import { FACES, faceStyle, STANDARD_FACE } from "./fonts";
import type { ResumeDoc, ResumeTheme } from "./schema";
import {
  baselineFromTop,
  belowBaseline,
  rulePadding,
  type Typeset,
  type TypeStyle,
} from "./typeset";

/**
 * Registered up front and fetched lazily: react-pdf only downloads a file the
 * first time a document actually sets text in it.
 */
for (const face of FACES) {
  if (face.builtin) continue;
  Font.register({
    family: face.id,
    fonts: [
      { src: `/fonts/${face.id}/400-normal.ttf`, fontWeight: 400 },
      { src: `/fonts/${face.id}/400-italic.ttf`, fontWeight: 400, fontStyle: "italic" },
      { src: `/fonts/${face.id}/700-normal.ttf`, fontWeight: 700 },
      { src: `/fonts/${face.id}/700-italic.ttf`, fontWeight: 700, fontStyle: "italic" },
    ],
  });
}
Font.register({ family: "Signature", src: "/fonts/GreatVibes-Regular.ttf" });
// react-pdf hyphenates by default. Word and Google Docs do not, and a resume
// that suddenly breaks "develop-ment" no longer looks like itself.
Font.registerHyphenationCallback((word) => [word]);

const PRESETS = {
  compact: { name: 18, body: 9.5, section: 10.5, gap: 8, item: 7, page: 36 },
  normal: { name: 20, body: 10, section: 11, gap: 10, item: 9, page: 44 },
  airy: { name: 22, body: 10.5, section: 11.5, gap: 14, item: 12, page: 48 },
} as const;

export function density(theme: ResumeTheme) {
  return { ...(PRESETS[theme.density] ?? PRESETS.normal), ...theme.metrics };
}

/**
 * DearCV's own look, for a resume built from scratch: the theme's presets
 * spelled out as a typeset, so it is drawn by the same code as a carried-over
 * one rather than by a second renderer that would drift from the first.
 */
export function defaultTypeset(theme: ResumeTheme): Typeset {
  const d = density(theme);
  const family = STANDARD_FACE[theme.font] ?? STANDARD_FACE.sans;
  const line = 1.35;
  const base = { family, size: d.body, bold: false, italic: false, caps: false, color: theme.text };
  const centred = theme.header === "centered" || theme.header === "accent-bar";

  return {
    name: { ...base, size: d.name, bold: true, tracking: 0.2, align: centred ? "center" : "left" },
    contact: {
      ...base,
      size: d.body - 0.5,
      color: theme.muted,
      align: centred ? "center" : "left",
      separator: "  ·  ",
    },
    heading: {
      ...base,
      size: d.section,
      bold: true,
      caps: true,
      tracking: 0.6,
      rule: {
        thickness: 0.6,
        color: theme.accent,
        offset: 3 + belowBaseline(d.section, line) + 0.3,
      },
    },
    org: { ...base, bold: true },
    title: base,
    meta: { ...base, color: theme.muted },
    trailer: { ...base, color: theme.muted },
    body: base,
    lines: base,
    row: { org: { ...base, bold: true }, meta: { ...base, color: theme.muted }, gap: 3 },
    lead: "org",
    orgSeparator: ", ",
    separatorWithOrg: false,
    dates: { align: "right", separator: " – " },
    bullet: { glyph: "dot", indent: 2, text: 16 },
    spacing: {
      line,
      contact: 6,
      header: d.gap + 4,
      section: d.item + d.gap + 4,
      heading: 5,
      item: d.item,
      subline: 1,
      bullets: 2,
      bullet: 2,
      lines: 2,
    },
    margins: { top: d.page, right: d.page, bottom: d.page, left: d.page },
    breaks: [],
  };
}

export const typesetFor = (doc: ResumeDoc) => doc.theme.typeset ?? defaultTypeset(doc.theme);

const text = (style: TypeStyle, line: number) => ({
  ...faceStyle(style.family, style.bold, style.italic),
  fontSize: style.size,
  color: style.color,
  lineHeight: line,
  textTransform: style.caps ? ("uppercase" as const) : ("none" as const),
  letterSpacing: style.tracking ?? 0,
});

/** How big each bullet glyph is drawn, as a share of the body size. */
const GLYPH_SIZE = { disc: 0.42, dot: 0.3, square: 0.34, ring: 0.36, dash: 0.5, none: 0 } as const;

function glyphStyle(ts: Typeset) {
  const { glyph } = ts.bullet;
  const { size, color } = ts.body;
  const line = ts.spacing.line;
  const width = GLYPH_SIZE[glyph] * size;
  const round = glyph === "disc" || glyph === "dot" || glyph === "ring";

  if (glyph === "dash") {
    const height = Math.max(0.6, size * 0.06);
    // On the x-height's middle, where a typed dash sits.
    return {
      width,
      height,
      backgroundColor: color,
      marginTop: baselineFromTop(size, line) - size * 0.27,
    };
  }
  return {
    width,
    height: width,
    // Centred on the first line box, which lands it on the x-height.
    marginTop: (size * line - width) / 2,
    borderRadius: round ? width / 2 : 0,
    ...(glyph === "ring" ? { borderWidth: 0.7, borderColor: color } : { backgroundColor: color }),
  };
}

/**
 * Every measurement on the page, resolved once per draw. Handed down rather
 * than recomputed, so the geometry the marks are read from and the geometry
 * the paper is set in cannot drift apart.
 */
export function sheet(doc: ResumeDoc) {
  const ts = typesetFor(doc);
  const { spacing: gap, margins } = ts;
  const line = gap.line;
  const dateRow = {
    flexDirection: "row" as const,
    justifyContent:
      ts.dates.align === "right" ? ("space-between" as const) : ("flex-start" as const),
    gap: 12,
  };

  const styles = StyleSheet.create({
    page: {
      backgroundColor: doc.theme.background,
      ...text(ts.body, line),
      paddingTop: margins.top,
      paddingBottom: margins.bottom,
      paddingLeft: doc.theme.header === "accent-bar" ? margins.left + 10 : margins.left,
      paddingRight: margins.right,
    },
    accentBar: {
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: 8,
      backgroundColor: doc.theme.accent,
    },
    name: text(ts.name, line),
    headline: { ...text({ ...ts.meta, size: ts.body.size }, line), marginTop: 3 },
    contact: { ...text(ts.contact, line), marginTop: gap.contact },
    link: { color: ts.contact.color, textDecoration: "none" },
    sectionTitle: {
      ...text(ts.heading, line),
      marginTop: gap.section,
      marginBottom: gap.heading,
      ...(ts.heading.rule
        ? {
            paddingBottom: rulePadding(ts.heading, line),
            borderBottomWidth: ts.heading.rule.thickness,
            borderBottomColor: ts.heading.rule.color,
          }
        : {}),
    },
    firstSectionTitle: { marginTop: gap.header },
    itemHead: dateRow,
    org: text(ts.org, line),
    title: text(ts.title, line),
    meta: text(ts.meta, line),
    trailer: text(ts.trailer, line),
    subline: { marginTop: gap.subline },
    bullets: { marginTop: gap.bullets },
    bullet: { flexDirection: "row" },
    nextBullet: { marginTop: gap.bullet },
    bulletGutter: { width: ts.bullet.text, paddingLeft: ts.bullet.indent },
    bulletGlyph: glyphStyle(ts),
    bulletText: { flex: 1 },
    line: text(ts.lines, line),
    summary: { marginTop: gap.header },
    signature: {
      fontFamily: "Signature",
      fontSize: 22,
      marginTop: 18,
      color: doc.theme.accent,
    },
    listRow: dateRow,
    rowOrg: text(ts.row.org, line),
    rowMeta: text(ts.row.meta, line),
  });

  /** The space above each kind of block, by what it follows. */
  const before = { line: gap.lines, item: gap.item, row: ts.row.gap };

  return Object.assign(styles, { typeset: ts, before });
}

/**
 * The real key list, rather than the open record `StyleSheet.create` is typed
 * to return. Naming a style that does not exist was silently undefined before.
 */
export type Sheet = ReturnType<typeof sheet>;
