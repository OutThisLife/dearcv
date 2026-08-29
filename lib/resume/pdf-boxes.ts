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
  basics: "basics",
  section: (id: string) => `section:${id}`,
  item: (id: string) => `item:${id}`,
};

export function readPdfBoxes(document: unknown): PdfBoxes {
  const boxes: PdfBoxes = {};

  ((document as LayoutNode)?.children ?? []).forEach((page, index) => {
    const visit = (node: LayoutNode, dx: number, dy: number) => {
      const x = dx + (node.box?.left ?? 0);
      const y = dy + (node.box?.top ?? 0);

      if (node.props?.id && node.box) {
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
