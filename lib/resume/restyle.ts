import { STANDARD_FACE } from "@/lib/resume/fonts";
import type { ResumeTheme } from "@/lib/resume/schema";
import type { Typeset, TypeStyle } from "@/lib/resume/typeset";

const DENSITY = { compact: 0.75, normal: 1, airy: 1.3 } as const;

/** Every styled role, for changes that land page-wide. */
function eachStyle(ts: Typeset, fn: (style: TypeStyle) => TypeStyle): Typeset {
  return {
    ...ts,
    name: { ...ts.name, ...fn(ts.name) },
    contact: { ...ts.contact, ...fn(ts.contact) },
    heading: { ...ts.heading, ...fn(ts.heading) },
    org: fn(ts.org),
    title: fn(ts.title),
    meta: fn(ts.meta),
    trailer: fn(ts.trailer),
    body: fn(ts.body),
    lines: fn(ts.lines),
    row: { ...ts.row, org: fn(ts.row.org), meta: fn(ts.row.meta) },
  };
}

const recolor = (from: string, to: string) => (style: TypeStyle) =>
  style.color.toLowerCase() === from.toLowerCase() ? { ...style, color: to } : style;

/**
 * A change they asked for, on top of the look measured off their file. The
 * measured look is the baseline and stays — a new accent recolours the rules
 * and whatever was set in the old accent, not the page — so "make the
 * headings blue" does not quietly throw away the rest of how it was set.
 */
export function restyle(theme: ResumeTheme, patch: Partial<ResumeTheme>): ResumeTheme {
  const next = { ...theme, ...patch };
  let ts = theme.typeset;
  if (!ts) return next;

  if (patch.font && patch.font !== theme.font) {
    const family = STANDARD_FACE[patch.font];
    ts = eachStyle(ts, (style) => ({ ...style, family }));
  }
  if (patch.text && patch.text !== theme.text) ts = eachStyle(ts, recolor(theme.text, patch.text));
  if (patch.muted && patch.muted !== theme.muted)
    ts = eachStyle(ts, recolor(theme.muted, patch.muted));
  if (patch.accent && patch.accent !== theme.accent) {
    // Only what was set in the accent follows it — unless the accent was the
    // text colour all along, as a black rule on black type is, in which case
    // recolouring by it would turn the whole page.
    if (theme.accent.toLowerCase() !== theme.text.toLowerCase()) {
      ts = eachStyle(ts, recolor(theme.accent, patch.accent));
    }
    if (ts.heading.rule)
      ts = { ...ts, heading: { ...ts.heading, rule: { ...ts.heading.rule, color: patch.accent } } };
  }
  if (patch.density && patch.density !== theme.density) {
    const factor = DENSITY[patch.density] / DENSITY[theme.density];
    const spacing = Object.fromEntries(
      Object.entries(ts.spacing).map(([key, value]) => [
        key,
        key === "line" ? value : value * factor,
      ]),
    ) as Typeset["spacing"];
    ts = { ...ts, spacing, row: { ...ts.row, gap: ts.row.gap * factor } };
  }
  if (patch.metrics?.body) {
    const factor = patch.metrics.body / (theme.metrics?.body ?? ts.body.size);
    ts = eachStyle(ts, (style) => ({ ...style, size: Math.round(style.size * factor * 10) / 10 }));
  }
  if (patch.header && patch.header !== theme.header) {
    const align = patch.header === "centered" || patch.header === "accent-bar" ? "center" : "left";
    ts = { ...ts, name: { ...ts.name, align }, contact: { ...ts.contact, align } };
  }

  return { ...next, typeset: ts };
}
