import { z } from "zod";

/**
 * How every kind of text on the page is set, and how far apart things sit.
 * Measured off an uploaded PDF (measure-typeset.ts) so a carried-over resume
 * keeps its own look — its face, which lines are bold, the rule under each
 * heading, the bullet glyph and indent, where the dates sit — or derived from
 * the theme's presets for one built from scratch. Rendering only ever reads
 * this, so there is one path onto paper, not one per origin.
 *
 * Never shown to the model: it is geometry, and restating it on every edit
 * would only give the model a chance to get it wrong.
 */

export const typeStyleSchema = z.object({
  /** An id from fonts.ts. */
  family: z.string(),
  size: z.number(),
  bold: z.boolean(),
  italic: z.boolean(),
  caps: z.boolean(),
  color: z.string(),
  /** Letter spacing in points. Measured pages leave it out. */
  tracking: z.number().optional(),
});

const alignSchema = z.enum(["left", "center", "right"]);

export const typesetSchema = z.object({
  name: typeStyleSchema.extend({ align: alignSchema }),
  contact: typeStyleSchema.extend({ align: alignSchema, separator: z.string() }),
  heading: typeStyleSchema.extend({
    /** Drawn under the heading. `offset` is baseline to rule, in points. */
    rule: z.object({ thickness: z.number(), color: z.string(), offset: z.number() }).nullable(),
  }),
  org: typeStyleSchema,
  title: typeStyleSchema,
  /** Dates. */
  meta: typeStyleSchema,
  /** The domain or location after the company. */
  trailer: typeStyleSchema,
  body: typeStyleSchema,
  /** Loose lines under a heading — a skills list — often set apart from bullets. */
  lines: typeStyleSchema,
  /**
   * One-line entries — a company and dates, nothing under them — which
   * resumes tend to set smaller and tighter than the ones with bullets.
   */
  row: z.object({ org: typeStyleSchema, meta: typeStyleSchema, gap: z.number() }),
  /** Which of company and role heads an entry; the dates sit on that line. */
  lead: z.enum(["org", "title"]),
  /** Between the company and its domain or location. */
  orgSeparator: z.string(),
  /** Whether that separator's comma was set with the company, in its weight. */
  separatorWithOrg: z.boolean(),
  dates: z.object({ align: z.enum(["right", "inline"]), separator: z.string() }),
  bullet: z.object({
    glyph: z.enum(["disc", "dot", "square", "dash", "ring", "none"]),
    /** From the text margin to the glyph, and to the bullet's text. */
    indent: z.number(),
    text: z.number(),
  }),
  /**
   * Gaps between boxes, in points: what is left once line heights are taken
   * out of the baseline distances on the original page.
   */
  spacing: z.object({
    line: z.number(),
    contact: z.number(),
    header: z.number(),
    section: z.number(),
    heading: z.number(),
    item: z.number(),
    subline: z.number(),
    /** Before an entry's first bullet, and between one bullet and the next. */
    bullets: z.number(),
    bullet: z.number(),
    /** Between one loose line and the next. */
    lines: z.number(),
  }),
  margins: z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() }),
  /**
   * Entries and sections the original started a new page at, though the page
   * before had room: a break someone put there on purpose.
   */
  breaks: z.array(z.string()),
});

export type TypeStyle = z.infer<typeof typeStyleSchema>;
export type Typeset = z.infer<typeof typesetSchema>;

/**
 * The one box model both sides agree on. Measuring turns baseline distances on
 * the original page into gaps between boxes; rendering stacks boxes with those
 * gaps. As long as both use these, a gap measured is a gap reproduced.
 *
 * A line box is `size × line` tall and its baseline sits a fixed share down it
 * — ascent ≈ 0.9em, descent ≈ 0.3em, the leading split evenly — which is close
 * enough for any Latin face to land within a point of the original.
 */
export const baselineFromTop = (size: number, line: number) => size * (line / 2 + 0.3);
export const belowBaseline = (size: number, line: number) =>
  size * line - baselineFromTop(size, line);

/** The gap to leave between two boxes whose baselines sit `distance` apart. */
export const gapBetween = (distance: number, above: number, below: number, line: number) =>
  distance - belowBaseline(above, line) - baselineFromTop(below, line);

/** Padding under a heading's text that puts its rule `offset` below the baseline. */
export const rulePadding = (heading: Typeset["heading"], line: number) =>
  heading.rule
    ? Math.max(
        0,
        heading.rule.offset - belowBaseline(heading.size, line) - heading.rule.thickness / 2,
      )
    : 0;
