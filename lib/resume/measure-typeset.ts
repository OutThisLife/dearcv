import type { LayoutMark, LayoutRule, LayoutRun, PdfLayout } from "@/lib/resume/read-pdf";
import { faceFor, genericOf } from "@/lib/resume/fonts";
import type { ResumeContent, ResumeTheme } from "@/lib/resume/schema";
import { gapBetween, rulePadding, type TypeStyle, type Typeset } from "@/lib/resume/typeset";

/**
 * Reads the look off an uploaded page, once its content is known.
 *
 * Geometry alone cannot say which line is a job title and which is a company,
 * but the transcription can: it knows the name, every heading, every company,
 * role, date and bullet. So each of those is found on the page by its text,
 * and whatever it was set in — face, size, weight, colour, where it sat — is
 * what that kind of text is set in from now on. Several samples of each are
 * taken and the most common wins, so one odd line cannot restyle the rest.
 */

type Line = {
  page: number;
  y: number;
  x0: number;
  x1: number;
  size: number;
  text: string;
  runs: LayoutRun[];
};

const norm = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** Stripped to letters and digits, for matching text the PDF wrapped or spaced oddly. */
const bare = (text: string) => norm(text).replace(/[^a-z0-9]/g, "");

/** The mid-line glyphs people separate contact details and dates with. */
const SEPARATOR = /\s*[•·|◦∙⋅▪●]\s*|\s+[–—-]\s+/;

const GLYPHS: [RegExp, Typeset["bullet"]["glyph"]][] = [
  [/[●⚫⬤]/, "disc"],
  [/[•∙·⋅]/, "dot"],
  [/[▪■◼▫□]/, "square"],
  [/[○◦]/, "ring"],
  [/[-–—‐]/, "dash"],
];

/** A drawn bullet, as the glyph it stands in for. */
function markGlyph(mark: LayoutMark, size: number) {
  if (mark.width > mark.height * 2) return "–";
  if (!mark.round) return "▪";
  return mark.width > size * 0.38 ? "●" : "•";
}

function mode<T>(values: T[], key: (value: T) => string = String): T | undefined {
  const counts = new Map<string, { value: T; n: number }>();
  for (const value of values) {
    const k = key(value);
    const entry = counts.get(k) ?? { value, n: 0 };
    entry.n += 1;
    counts.set(k, entry);
  }
  return [...counts.values()].sort((one, two) => two.n - one.n)[0]?.value;
}

function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((one, two) => one - two);
  return sorted[Math.floor(sorted.length / 2)];
}

const round = (value: number) => Math.round(value * 10) / 10;

/** Runs that share a baseline, left to right, as one line of text. */
function toLines(runs: LayoutRun[]): Line[] {
  const lines: Line[] = [];
  const ordered = [...runs].sort(
    (one, two) => one.page - two.page || two.y - one.y || one.x - two.x,
  );
  for (const run of ordered) {
    const line = lines.at(-1);
    if (
      line &&
      line.page === run.page &&
      Math.abs(line.y - run.y) < Math.min(line.size, run.size) * 0.4
    ) {
      line.runs.push(run);
      line.size = Math.max(line.size, run.size);
      continue;
    }
    lines.push({ page: run.page, y: run.y, x0: 0, x1: 0, size: run.size, text: "", runs: [run] });
  }
  for (const line of lines) {
    line.runs.sort((one, two) => one.x - two.x);
    line.x0 = line.runs[0].x;
    line.x1 = Math.max(...line.runs.map((run) => run.x + run.width));
    line.text = line.runs.reduce((text, run, i) => {
      if (!i) return run.text;
      const prev = line.runs[i - 1];
      const gap = run.x - (prev.x + prev.width);
      return (
        text +
        (gap > run.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(run.text) ? " " : "") +
        run.text
      );
    }, "");
  }
  return lines;
}

/**
 * Finds text on the page in reading order. A cursor moves forward with each
 * find, so the third "Senior Engineer" on the page is matched to the third
 * job rather than all three to the first.
 */
function finder(lines: Line[]) {
  let cursor = 0;
  return {
    /** `move: false` looks without taking: for comparing where two things fall. */
    find(text: string | undefined, { whole = false, from = cursor, move = true } = {}) {
      const target = text ? bare(text) : "";
      if (target.length < 2) return undefined;
      for (let i = from; i < lines.length; i += 1) {
        const line = bare(lines[i].text);
        const hit = whole
          ? line === target
          : line.startsWith(target.slice(0, 48)) ||
            (target.length > 6 && line.includes(target.slice(0, 48)));
        if (hit) {
          if (move) cursor = i + 1;
          return { line: lines[i], index: i };
        }
      }
      return undefined;
    },
    get cursor() {
      return cursor;
    },
    set cursor(value: number) {
      cursor = value;
    },
  };
}

/** The run on a line that carries `text`, or the line's first run. */
function runFor(line: Line, text?: string) {
  if (text) {
    const target = bare(text).slice(0, 12);
    const hit = line.runs.find(
      (run) =>
        bare(run.text).length > 1 &&
        (bare(run.text).startsWith(target) || target.startsWith(bare(run.text))),
    );
    if (hit) return hit;
  }
  return line.runs.find((run) => run.text.trim().length > 1) ?? line.runs[0];
}

function styleOf(
  samples: LayoutRun[],
  generic: ResumeTheme["font"],
  caps = false,
): TypeStyle | undefined {
  if (!samples.length) return undefined;
  const run = mode(
    samples,
    (one) => `${one.family}|${one.size}|${one.bold}|${one.italic}|${one.color}`,
  )!;
  return {
    family: faceFor(run.family, generic),
    size: run.size,
    bold: run.bold,
    italic: run.italic,
    caps,
    color: run.color,
  };
}

const isCaps = (printed: string, written: string) =>
  printed === printed.toUpperCase() && written !== written.toUpperCase();

function alignOf(line: Line, width: number, right: number): "left" | "center" | "right" {
  const mid = (line.x0 + line.x1) / 2;
  if (Math.abs(mid - width / 2) < width * 0.04) return "center";
  if (Math.abs(line.x1 - right) < 4 && line.x0 > width / 2) return "right";
  return "left";
}

function ruleUnder(line: Line, rules: LayoutRule[], contentWidth: number) {
  return rules
    .filter(
      (rule) =>
        rule.page === line.page &&
        rule.y < line.y &&
        line.y - rule.y < line.size * 1.6 &&
        rule.x2 - rule.x1 > contentWidth * 0.3,
    )
    .sort((one, two) => two.y - one.y)[0];
}

/**
 * The bottom margin: how low text went on a page that still continued onto
 * the next — text never went below it, so ours should not either, or the
 * last entry of a page creeps up from the next one. Capped, since a page cut
 * short on purpose says nothing about the margin.
 */
function bottomMargin(lines: Line[], side: number) {
  const pages = Math.max(...lines.map((line) => line.page));
  const floors = [];
  for (let n = 1; n < pages; n += 1) {
    const onPage = lines.filter((line) => line.page === n);
    if (onPage.length) floors.push(Math.min(...onPage.map((line) => line.y - line.size * 0.3)));
  }
  const floor = floors.length ? Math.min(...floors) : side;
  return Math.max(24, Math.min(side * 1.5, Math.max(side, floor)));
}

/**
 * Everything the page says about its own look, or null when too little of the
 * transcription could be found on it to trust — a scan, or text drawn as
 * outlines — in which case the theme's presets stand.
 */
export function measureTypeset(
  layout: PdfLayout,
  content: ResumeContent,
  theme: ResumeTheme,
): { typeset: Typeset; header: ResumeTheme["header"] } | null {
  const lines = toLines(layout.runs);
  if (lines.length < 4) return null;

  const generic = theme.font;
  const firstPage = lines.filter((line) => line.page === 1);
  const left = Math.min(...firstPage.map((line) => line.x0));
  const right = Math.max(...firstPage.map((line) => line.x1));
  const contentWidth = right - left;
  const page = finder(lines);

  // The header: the name, then the contact line under it.
  const { basics } = content;
  const nameHit = page.find(basics.name);
  const contactNeedles = [
    basics.email,
    basics.phone,
    ...basics.links.map((link) => link.label),
    basics.location,
  ];
  let contactHit: ReturnType<typeof page.find>;
  for (const needle of contactNeedles) {
    if (!needle) continue;
    const from = nameHit ? nameHit.index : 0;
    const hit = lines
      .slice(from, from + 6)
      .findIndex((line) => bare(line.text).includes(bare(needle)));
    if (hit !== -1) {
      contactHit = { line: lines[from + hit], index: from + hit };
      break;
    }
  }

  const samples = {
    heading: [] as LayoutRun[],
    org: [] as LayoutRun[],
    title: [] as LayoutRun[],
    meta: [] as LayoutRun[],
    body: [] as LayoutRun[],
    lines: [] as LayoutRun[],
    rowOrg: [] as LayoutRun[],
    rowMeta: [] as LayoutRun[],
    trailer: [] as LayoutRun[],
    glyph: [] as { glyph: string; x: number; text: number }[],
  };
  const lead: Typeset["lead"][] = [];
  const dateAlign: Typeset["dates"]["align"][] = [];
  const dateSeparators: string[] = [];
  const orgSeparators: string[] = [];
  const withOrg: boolean[] = [];
  const caps: boolean[] = [];
  const rules: LayoutRule[] = [];
  const gaps = {
    header: [] as number[],
    section: [] as number[],
    heading: [] as number[],
    item: [] as number[],
    subline: [] as number[],
    bullets: [] as number[],
    bullet: [] as number[],
    row: [] as number[],
    lines: [] as number[],
  };
  // Baseline distances first; turned into box gaps once the line height is known.
  const pairs: { gap: keyof typeof gaps; above: Line; below: Line }[] = [];
  // Line height, from a paragraph's own wrapped lines where there are any —
  // consecutive paragraphs have their gap in the distance too.
  const wraps: number[] = [];
  const steps: number[] = [];
  let firstHeading: Line | undefined;
  let previous: Line | undefined = contactHit?.line ?? nameHit?.line;

  const pair = (gap: keyof typeof gaps, above: Line | undefined, below: Line | undefined) => {
    if (above && below && above.page === below.page && above.y > below.y)
      pairs.push({ gap, above, below });
  };

  // A new page the previous one had room to continue: a break put there on purpose.
  const breaks: string[] = [];
  const brokeBefore = (id: string, line: Line) => {
    if (previous && line.page > previous.page && previous.y - left > previous.size * 4)
      breaks.push(id);
  };

  for (const section of content.sections) {
    const heading = page.find(section.title, { whole: true });
    if (heading) {
      brokeBefore(section.id, heading.line);
      samples.heading.push(runFor(heading.line, section.title));
      caps.push(isCaps(heading.line.text, section.title));
      const rule = ruleUnder(heading.line, layout.rules, contentWidth);
      if (rule) rules.push({ ...rule, y: heading.line.y - rule.y });
      if (!firstHeading) {
        firstHeading = heading.line;
        pair("header", previous, heading.line);
      } else {
        pair("section", previous, heading.line);
      }
      previous = heading.line;
    }

    // Loose lines come first on the page, as they do when drawn, and
    // consecutive ones show the line height.
    let lastLine: Line | undefined;
    for (const text of section.lines ?? []) {
      const hit = page.find(text.slice(0, 60));
      if (!hit) continue;
      samples.lines.push(runFor(hit.line, text));
      if (lastLine) steps.push((lastLine.y - hit.line.y) / hit.line.size);
      pair(lastLine ? "lines" : "heading", lastLine ?? previous, hit.line);
      lastLine = hit.line;
      previous = hit.line;
    }

    let after: "none" | "entry" | "row" = lastLine ? "entry" : "none";
    for (const item of section.items) {
      const orgText = item.org?.trim() || undefined;
      const titleText = orgText ? item.title : undefined;
      const named = orgText ?? item.title;
      // Company and role are looked for side by side, since either may come
      // first; whichever the page reaches first is what heads an entry.
      let orgHit = page.find(named, { move: false });
      let titleHit = titleText ? page.find(titleText, { move: false }) : undefined;
      if (orgHit && titleHit && Math.abs(orgHit.index - titleHit.index) > 3) {
        if (orgHit.index < titleHit.index) titleHit = undefined;
        else orgHit = undefined;
      }
      if (!orgHit) continue;
      const titleOnOwnLine = titleHit && titleHit.index !== orgHit.index;
      const row = section.kind === "list" || (!item.bullets.length && !titleOnOwnLine);
      const [leadHit, subHit] =
        titleHit && titleOnOwnLine && titleHit.index < orgHit.index
          ? [titleHit, orgHit]
          : [orgHit, titleOnOwnLine ? titleHit : undefined];
      if (titleOnOwnLine) lead.push(leadHit === orgHit ? "org" : "title");
      page.cursor = Math.max(leadHit.index, subHit?.index ?? 0) + 1;
      brokeBefore(item.id, leadHit.line);

      const orgRun = runFor(orgHit.line, named);
      (row ? samples.rowOrg : samples.org).push(orgRun);
      if (titleHit) samples.title.push(runFor(titleHit.line, titleText));

      pair(
        after === "none" ? "heading" : after === "row" && row ? "row" : "item",
        previous,
        leadHit.line,
      );
      pair("subline", leadHit.line, subHit?.line);
      after = row ? "row" : "entry";
      previous = subHit?.line ?? leadHit.line;

      // Dates, domain and location share the company line.
      if (item.start) {
        const start = bare(item.start);
        const holder = [leadHit.line, subHit?.line].find((line) =>
          line?.runs.some((run) => bare(run.text).includes(start)),
        );
        const dateRun = holder?.runs.find((run) => bare(run.text).includes(start));
        if (holder && dateRun) {
          (row ? samples.rowMeta : samples.meta).push(dateRun);
          dateAlign.push(
            Math.abs(dateRun.x + dateRun.width - right) < 4 && dateRun.x > layout.width / 2
              ? "right"
              : "inline",
          );
          if (item.end) {
            const printed = dateRun.text;
            const from = printed.indexOf(item.start) + item.start.length;
            const to = printed.indexOf(item.end, from);
            if (from >= item.start.length && to > from)
              dateSeparators.push(printed.slice(from, to));
          }
        }
      }
      const host = item.href
        ?.replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/$/, "");
      const trailer = host || item.location;
      if (trailer) {
        const text = orgHit.line.text;
        const at = norm(text).indexOf(norm(named));
        const next = norm(text).indexOf(norm(trailer), at + named.length);
        if (at !== -1 && next !== -1) {
          const separator = text.slice(at + named.length, next);
          orgSeparators.push(separator);
          const mark = separator.trim();
          if (mark) withOrg.push(orgRun.text.trimEnd().endsWith(mark));
        }
        // Set in its own run, or run on inside the company's — then it wears the company's style.
        const trailerRun =
          orgHit.line.runs.find(
            (run) => run !== orgRun && bare(run.text).startsWith(bare(trailer).slice(0, 8)),
          ) ?? (bare(orgRun.text).includes(bare(trailer)) ? orgRun : undefined);
        if (trailerRun && !row) samples.trailer.push(trailerRun);
      }

      // Bullets: the glyph, where it sits, and where the text after it starts.
      let lastBullet: Line | undefined;
      item.bullets.forEach((bullet, b) => {
        const hit = page.find(bullet.slice(0, 60));
        if (!hit) return;
        const textRun = runFor(hit.line, bullet);
        samples.body.push(textRun);
        const glyphRun = hit.line.runs.find(
          (run) => run.x < textRun.x && run.text.trim().length <= 2,
        );
        const inline = !glyphRun && textRun.text.trim().match(/^([●⚫⬤•∙·⋅▪■◼▫□○◦–—‐-])\s/);
        // Or drawn: browsers and Word paint list bullets as shapes, not text.
        const mark = layout.marks.find(
          (one) =>
            one.page === hit.line.page &&
            one.x < textRun.x &&
            textRun.x - one.x < textRun.size * 3 &&
            Math.abs(one.y - (hit.line.y + textRun.size * 0.3)) < textRun.size * 0.45,
        );
        if (glyphRun)
          samples.glyph.push({ glyph: glyphRun.text.trim(), x: glyphRun.x, text: textRun.x });
        else if (inline)
          samples.glyph.push({
            glyph: inline[1],
            x: textRun.x,
            text: textRun.x + textRun.size * 0.9,
          });
        else if (mark)
          samples.glyph.push({
            glyph: markGlyph(mark, textRun.size),
            x: mark.x - mark.width / 2,
            text: textRun.x,
          });
        else samples.glyph.push({ glyph: "", x: textRun.x, text: textRun.x });

        pair(lastBullet ? "bullet" : "bullets", lastBullet ?? previous, hit.line);
        // The lines a bullet wraps onto sit at its text's indent, and show
        // the line height directly.
        const next = bare(item.bullets[b + 1] ?? "").slice(0, 12);
        let last = hit.line;
        for (let j = hit.index + 1; j < lines.length; j += 1) {
          const wrapped = lines[j];
          if (wrapped.page !== last.page || Math.abs(wrapped.x0 - textRun.x) > 2) break;
          if (next && bare(wrapped.text).startsWith(next)) break;
          wraps.push((last.y - wrapped.y) / textRun.size);
          last = wrapped;
          page.cursor = j + 1;
        }
        lastBullet = last;
        previous = last;
      });
    }
  }

  // Too little found to trust anything else we'd infer.
  if (!nameHit || samples.body.length + samples.lines.length + samples.org.length < 3) return null;

  const body =
    styleOf(samples.body, generic) ??
    styleOf(samples.lines, generic) ??
    styleOf(samples.org, generic)!;
  const plausible = (ratios: number[]) =>
    median(ratios.filter((ratio) => ratio > 0.9 && ratio < 2.2));
  const line =
    Math.round(Math.min(1.8, Math.max(1.05, plausible(wraps) ?? plausible(steps) ?? 1.3)) * 100) /
    100;
  const nameRun = runFor(nameHit.line, basics.name);
  const name = {
    ...styleOf([nameRun], generic)!,
    caps: isCaps(nameHit.line.text, basics.name),
    align: alignOf(nameHit.line, layout.width, right),
  };
  const contactRun = contactHit
    ? mode(contactHit.line.runs, (run) => `${run.size}|${run.color}|${run.bold}`)!
    : undefined;
  const separator = contactHit?.line.text.match(SEPARATOR)?.[0];
  const contact = {
    ...(contactRun ? styleOf([contactRun], generic)! : { ...body, size: body.size - 0.5 }),
    align: contactHit ? alignOf(contactHit.line, layout.width, right) : name.align,
    separator: separator ? (separator.trim() ? ` ${separator.trim()} ` : separator) : "  ·  ",
  };
  const headingStyle = styleOf(samples.heading, generic, mode(caps) ?? false) ?? {
    ...body,
    bold: true,
    size: body.size + 1,
  };
  const rule = mode(rules, (one) => `${one.thickness}|${one.color}`);
  const ruleOffsets = rules.map((one) => one.y);
  const glyph = mode(samples.glyph, (sample) => sample.glyph);
  const glyphKind = glyph?.glyph
    ? (GLYPHS.find(([pattern]) => pattern.test(glyph.glyph))?.[1] ?? "dot")
    : "none";
  const indents = samples.glyph.filter((sample) => sample.glyph === glyph?.glyph);

  const typeset: Typeset = {
    name,
    contact,
    heading: {
      ...headingStyle,
      rule: rule
        ? { thickness: rule.thickness, color: rule.color, offset: round(median(ruleOffsets)!) }
        : null,
    },
    org: styleOf(samples.org, generic) ?? { ...body, bold: true },
    title: styleOf(samples.title, generic) ?? body,
    meta: styleOf(samples.meta, generic) ?? body,
    trailer: styleOf(samples.trailer, generic) ?? styleOf(samples.meta, generic) ?? body,
    body,
    lines: styleOf(samples.lines, generic) ?? body,
    row: {
      org: styleOf(samples.rowOrg, generic) ??
        styleOf(samples.org, generic) ?? { ...body, bold: true },
      meta: styleOf(samples.rowMeta, generic) ?? styleOf(samples.meta, generic) ?? body,
      gap: 0,
    },
    lead: mode(lead) ?? "org",
    orgSeparator: mode(orgSeparators) ?? ", ",
    separatorWithOrg: mode(withOrg) ?? false,
    dates: {
      align: mode(dateAlign) ?? "right",
      separator: mode(dateSeparators) ?? " – ",
    },
    bullet: {
      glyph: glyphKind,
      indent: round(Math.max(0, (median(indents.map((one) => one.x)) ?? left) - left)),
      text: round(Math.max(0, (median(indents.map((one) => one.text)) ?? left + 14) - left)),
    },
    spacing: {
      line,
      contact: 0,
      header: 0,
      section: 0,
      heading: 0,
      item: 0,
      subline: 0,
      bullets: 0,
      bullet: 0,
      lines: 0,
    },
    margins: {
      top: round(Math.max(18, layout.height - nameHit.line.y - nameRun.size * (line / 2 + 0.3))),
      left: round(left),
      right: round(Math.max(18, layout.width - right)),
      bottom: round(bottomMargin(lines, left)),
    },
    breaks,
  };

  // Box gaps from baseline distances, now that the line height is fixed.
  if (
    contactHit &&
    nameHit.line.page === contactHit.line.page &&
    nameHit.line.y > contactHit.line.y
  ) {
    typeset.spacing.contact = round(
      Math.max(0, gapBetween(nameHit.line.y - contactHit.line.y, name.size, contact.size, line)),
    );
  }
  const { rule: drawn } = typeset.heading;
  for (const { gap, above, below } of pairs) {
    let distance = above.y - below.y;
    // Under a ruled heading the rule and its padding sit between the two lines.
    if (gap === "heading" && drawn)
      distance -= rulePadding(typeset.heading, line) + drawn.thickness;
    gaps[gap].push(gapBetween(distance, above.size, below.size, line));
  }
  const fallback = {
    header: 12,
    section: 14,
    heading: 4,
    item: 10,
    subline: 1,
    bullets: 2,
    bullet: 0,
    row: 2,
    lines: 1,
  };
  for (const key of Object.keys(gaps) as (keyof typeof gaps)[]) {
    const value = round(Math.max(0, median(gaps[key]) ?? fallback[key]));
    if (key === "row") typeset.row.gap = value;
    else typeset.spacing[key] = value;
  }

  const header: ResumeTheme["header"] =
    name.align === "center"
      ? "centered"
      : contactHit && Math.abs(contactHit.line.y - nameHit.line.y) < name.size * 0.6
        ? "split"
        : "left";

  return { typeset, header };
}

/**
 * The theme with the measured look folded in, and its plain fields — face,
 * colours, header — set to agree with it, so a later restyle knows what it is
 * changing from. The theme as it was when there is nothing to trust.
 */
export function measuredTheme(
  theme: ResumeTheme,
  layout: PdfLayout,
  content: ResumeContent,
): ResumeTheme {
  const measured = measureTypeset(layout, content, theme);
  if (!measured) return theme;
  const { typeset, header } = measured;

  return {
    ...theme,
    header,
    font: genericOf(typeset.body.family),
    text: typeset.body.color,
    muted: typeset.meta.color,
    accent: typeset.heading.rule?.color ?? typeset.heading.color,
    typeset,
  };
}
