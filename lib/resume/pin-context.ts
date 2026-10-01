import type { PageLine } from "@/hooks/use-pdf-pages";
import type { Anchor, Pin } from "@/lib/comments";
import type { PdfBoxes } from "@/lib/resume/pdf-boxes";
import type { ResumeDoc } from "@/lib/resume/schema";

/**
 * Where a comment's pin landed, told the way someone would say it: the line
 * under it and the word it points at, the lines either side for context, and
 * which part of the resume that is, by the ids the editing tools take. Worked
 * out from what is on screen — the painted page's own text — so it is right
 * whether that page is their file or our redraw of it.
 */

/** How far off a line a pin can be and still mean that line. */
const LINE_SLACK_PT = 3;
/** A pin in the margin beside a part still means it, this far out. */
const MARGIN_PT = 36;
/** Lines either side, for context. */
const AROUND = 2;

const quote = (text: string) => `“${text}”`;

/** The line under a pin, or failing that the nearest one. */
function lineAt(lines: PageLine[], y: number) {
  let best = -1;
  let distance = Infinity;
  lines.forEach((line, i) => {
    const off =
      y < line.top - LINE_SLACK_PT
        ? line.top - y
        : y > line.top + line.height + LINE_SLACK_PT
          ? y - (line.top + line.height)
          : 0;
    if (off < distance) {
      distance = off;
      best = i;
    }
  });
  return { index: best, on: distance === 0 };
}

/** The word under a point along a line, by where it falls across the line's width. */
function wordAt(line: PageLine, x: number) {
  if (x < line.x || x > line.x + line.width) return undefined;
  const at = Math.round(((x - line.x) / line.width) * line.text.length);
  const before = line.text.slice(0, at).match(/[\p{L}\p{N}'’&./-]*$/u)?.[0] ?? "";
  const after = line.text.slice(at).match(/^[\p{L}\p{N}'’&./-]*/u)?.[0] ?? "";
  const word = `${before}${after}`;
  return word.length > 1 ? word : undefined;
}

/** The smallest part of the resume the point falls in, or the one it sits in the margin of. */
function boxAt(boxes: PdfBoxes, pin: Pin) {
  const onPage = Object.entries(boxes).filter(([, box]) => box.page === pin.page);
  const inside = onPage
    .filter(
      ([, box]) =>
        pin.x >= box.x &&
        pin.x <= box.x + box.width &&
        pin.y >= box.y &&
        pin.y <= box.y + box.height,
    )
    .sort(([, a], [, b]) => a.width * a.height - b.width * b.height);
  if (inside[0]) return inside[0];

  const beside = onPage
    .map(([id, box]) => {
      const dy =
        pin.y < box.y ? box.y - pin.y : pin.y > box.y + box.height ? pin.y - box.y - box.height : 0;
      const dx =
        pin.x < box.x ? box.x - pin.x : pin.x > box.x + box.width ? pin.x - box.x - box.width : 0;
      return [id, box, Math.hypot(dx, dy)] as const;
    })
    .filter(([, , distance]) => distance <= MARGIN_PT)
    .sort((a, b) => a[2] - b[2] || a[1].width * a[1].height - b[1].width * b[1].height);
  return beside[0] && ([beside[0][0], beside[0][1]] as const);
}

/** A part of the resume by the names a person and the tools would use. */
function describeBox(id: string, doc: ResumeDoc) {
  if (id === "basics")
    return "the header — their name and contact details (edit with update_basics)";
  const [kind, key] = id.split(":");
  if (kind === "section") {
    const section = doc.sections.find((one) => one.id === key);
    return section ? `the ${quote(section.title)} section (section id "${section.id}")` : undefined;
  }
  for (const section of doc.sections) {
    const item = section.items.find((one) => one.id === key);
    if (!item) continue;
    const name = [item.org, item.title].filter(Boolean).join(" — ");
    return `the entry ${quote(name)} (item id "${item.id}") in the ${quote(section.title)} section (section id "${section.id}")`;
  }
  return undefined;
}

export function locatePin(
  pin: Pin,
  lines: PageLine[],
  boxes: PdfBoxes,
  doc: ResumeDoc,
): { anchor: Anchor | null; where: string } {
  const said = [`Page ${pin.page + 1}.`];

  const { index, on } = lineAt(lines, pin.y);
  const line = lines[index];
  if (line) {
    const word = on ? wordAt(line, pin.x) : undefined;
    said.push(
      on
        ? `On the line ${quote(line.text)}${word ? `, at the word ${quote(word)}` : pin.x > line.x + line.width ? ", just past its end" : ", in the margin before it"}.`
        : `Between lines, nearest to ${quote(line.text)}.`,
    );
    const above = lines.slice(Math.max(0, index - AROUND), index).map((one) => quote(one.text));
    const below = lines.slice(index + 1, index + 1 + AROUND).map((one) => quote(one.text));
    if (above.length) said.push(`Above it: ${above.join(" / ")}.`);
    if (below.length) said.push(`Below it: ${below.join(" / ")}.`);
  } else {
    said.push("On an empty part of the page.");
  }

  const hit = boxAt(boxes, pin);
  const part = hit && describeBox(hit[0], doc);
  if (part) said.push(`It falls in ${part}.`);

  return {
    where: said.join("\n"),
    anchor: hit
      ? {
          box: hit[0],
          fx: (pin.x - hit[1].x) / (hit[1].width || 1),
          fy: (pin.y - hit[1].y) / (hit[1].height || 1),
        }
      : null,
  };
}
