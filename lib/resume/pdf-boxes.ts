import type { ResumeDoc, ResumeSection } from "@/lib/resume/schema";

/**
 * Where each part of the resume landed on the page.
 *
 * react-pdf lays the document out with Yoga and hands the finished tree to
 * `onRender`. Every node carries the box Yoga gave it, and any `id` we set in
 * the JSX survives onto it — so tagging a View is enough to find it again.
 * Boxes are relative to the parent (the renderer translates by `box.left/top`
 * before drawing children), so the walk accumulates offsets on the way down.
 *
 * Coordinates come out in PDF points, which the preview scales to CSS pixels.
 */

type LayoutBox = { left: number; top: number; width: number; height: number };

type LayoutNode = {
  type?: string;
  props?: { id?: string };
  box?: LayoutBox;
  children?: LayoutNode[];
};

export type PdfBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfBoxes = Record<string, PdfBox>;

export const boxIds = {
  /** The whole document — a restyle, a rewrite, a read. Not a box of its own: every page. */
  page: "page",
  basics: "basics",
  section: (id: string) => `section:${id}`,
  item: (id: string) => `item:${id}`,
  /** A drawing, picture or stroke on the page. */
  art: (id: string) => `art:${id}`,
};

export function readPdfBoxes(document: unknown): PdfBoxes {
  const boxes: PdfBoxes = {};

  ((document as LayoutNode)?.children ?? []).forEach((page, index) => {
    const visit = (node: LayoutNode, dx: number, dy: number) => {
      const x = dx + (node.box?.left ?? 0);
      const y = dy + (node.box?.top ?? 0);

      // A section or role that breaks across pages is laid out once per page
      // it lands on. Where it starts is where it is.
      if (node.props?.id && node.box && !boxes[node.props.id]) {
        boxes[node.props.id] = {
          page: index,
          x,
          y,
          width: node.box.width,
          height: node.box.height,
        };
      }

      // Text lays its own runs out internally and the renderer does not
      // translate into it, so neither do we.
      if (node.type === "TEXT") return;
      node.children?.forEach((child) => visit(child, x, y));
    };

    visit(page, 0, 0);
  });

  return boxes;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The boxes that differ between two versions of a document, named the way an
 * edit would have marked them — so stepping through history can show what
 * each step changed as if it were happening again. Something that is gone has
 * no box to point at, so its section, or whatever moved up into its place,
 * stands in for it. A change of look touches every line, so it is the page.
 */
export function changedBoxes(from: ResumeDoc, to: ResumeDoc): string[] {
  if (!same(from.theme, to.theme)) return [boxIds.page];

  const changed = new Set<string>();
  if (!same(from.basics, to.basics)) changed.add(boxIds.basics);

  const was = new Map(from.sections.map((section) => [section.id, section]));
  const kept = (sections: ResumeSection[], other: ResumeDoc) =>
    sections.filter((section) => other.sections.some((one) => one.id === section.id));
  const order = kept(to.sections, from).map((section) => section.id);
  const before = kept(from.sections, to).map((section) => section.id);

  to.sections.forEach((section) => {
    const old = was.get(section.id);
    const moved = order.indexOf(section.id) !== before.indexOf(section.id);
    if (!old || moved || !same({ ...old, items: [] }, { ...section, items: [] })) {
      changed.add(boxIds.section(section.id));
      return;
    }
    const items = new Map(old.items.map((item) => [item.id, item]));
    const lost = old.items.some((item) => !section.items.some((one) => one.id === item.id));
    const reordered = !same(
      old.items.map((item) => item.id).filter((id) => section.items.some((one) => one.id === id)),
      section.items.map((item) => item.id).filter((id) => items.has(id)),
    );
    if (lost || reordered) {
      changed.add(boxIds.section(section.id));
      return;
    }
    section.items.forEach((item) => {
      if (!same(items.get(item.id), item)) changed.add(boxIds.item(item.id));
    });
  });

  // A section that went: point at what now sits where it was.
  from.sections.forEach((section, i) => {
    if (to.sections.some((one) => one.id === section.id)) return;
    const next = from.sections
      .slice(i + 1)
      .concat(from.sections.slice(0, i).reverse())
      .find((one) => to.sections.some((kept) => kept.id === one.id));
    if (next) changed.add(boxIds.section(next.id));
  });

  // Art that appeared or changed is its own box; art that went has none, so
  // whatever it was pinned to stands in, or the page for a loose piece.
  const wasArt = new Map((from.art ?? []).map((piece) => [piece.id, piece]));
  for (const piece of to.art ?? []) {
    if (!same(wasArt.get(piece.id), piece)) changed.add(boxIds.art(piece.id));
  }
  for (const piece of from.art ?? []) {
    if (to.art?.some((one) => one.id === piece.id)) continue;
    changed.add(piece.anchor ?? boxIds.page);
  }

  return [...changed];
}
