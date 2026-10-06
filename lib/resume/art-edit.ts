import { type Art, artSchema, isAsset, PAGE_SIZE, readSvg } from "@/lib/resume/art";
import { boxIds, type PdfBox, type PdfBoxes } from "@/lib/resume/pdf-boxes";
import type { ResumeDoc } from "@/lib/resume/schema";
import { resolvePicture, retryPicture, useAssetsStore } from "@/lib/store/assets";

/**
 * Putting art on the page, checked the way a designer would check it: that
 * it names something real to draw, is pinned to a part that exists, keeps a
 * picture's proportions, and — once the page is redrawn — where it actually
 * landed and what it now covers. The answers go back to the model, which
 * otherwise places things blind.
 */

/** A piece as a call sends it: the id, and whatever is new about it. */
export type ArtPatch = Partial<Art> & { id: string };

/** Where art can be pinned, by the ids the page uses. */
export function anchorsOf(doc: ResumeDoc) {
  return new Set([
    boxIds.basics,
    ...doc.sections.flatMap((section) => [
      boxIds.section(section.id),
      ...section.items.map((item) => boxIds.item(item.id)),
    ]),
  ]);
}

const pageSize = (doc: ResumeDoc) => PAGE_SIZE[doc.theme.page] ?? PAGE_SIZE.letter;

/** One piece, merged onto what was there and checked. Throws what is wrong, in words. */
async function settle(
  patch: ArtPatch,
  was: Art | undefined,
  doc: ResumeDoc,
  threadId: string,
  notes: string[],
): Promise<Art> {
  // A patch that names a new kind of content replaces the old one: a sticker
  // swapped for a drawing doesn't keep drawing the sticker under it.
  const kinds = (["svg", "image", "strokes"] as const).filter((key) => patch[key] !== undefined);
  const base =
    was && kinds.length ? { ...was, svg: undefined, image: undefined, strokes: undefined } : was;
  const merged = { label: patch.id.replace(/[-_]+/g, " "), ...base, ...patch };
  if (merged.anchor === "") delete merged.anchor;

  const parsed = artSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "piece"}: ${issue.message}`,
    );
    throw new Error(`Art "${patch.id}" isn't complete — ${issues.join("; ")}.`);
  }
  const piece = parsed.data;
  if (!piece.svg && !piece.image && !piece.strokes?.length) {
    throw new Error(`Art "${piece.id}" has nothing to draw: give it svg, image or strokes.`);
  }

  if (piece.anchor && !anchorsOf(doc).has(piece.anchor)) {
    throw new Error(
      `There is no "${piece.anchor}" to pin "${piece.id}" to. Use basics, section:<id> or item:<id> from the resume, or leave anchor out to place it on the page.`,
    );
  }

  if (patch.svg !== undefined) {
    const { tree, dropped } = readSvg(piece.svg ?? "");
    if (!tree) {
      throw new Error(
        `The SVG for "${piece.id}" has nothing drawable in it. Send complete <svg viewBox="…">…</svg> markup made of paths, shapes, gradients or text.`,
      );
    }
    if (dropped.length) {
      notes.push(
        `"${piece.id}": a PDF can't draw ${dropped.map((tag) => `<${tag}>`).join(", ")}, so those parts were left out. Use plain shapes, paths, gradients and clipPath.`,
      );
    }
  }

  if (patch.image !== undefined && piece.image) {
    if (!isAsset(piece.image) && !/^https?:\/\//i.test(piece.image)) {
      throw new Error(
        `"${piece.image}" isn't a picture this can use: give an asset id or an http(s) link.`,
      );
    }
    retryPicture(piece.image);
    const file = await resolvePicture(piece.image, threadId);
    if (!file) {
      const why = useAssetsStore.getState().failed[piece.image] ?? "it couldn't be loaded";
      throw new Error(`Couldn't use the picture for "${piece.id}": ${why}. Try another.`);
    }
    // Keep a picture's own proportions, unless it was asked to fill and crop:
    // a box of the wrong shape leaves bands of nothing that still count as the
    // piece, so it overlaps text it isn't touching.
    const aspect = file.height / file.width;
    if (piece.fit !== "cover" && Math.abs(piece.height / piece.width - aspect) > 0.02) {
      const height = Math.round(piece.width * aspect * 10) / 10;
      notes.push(
        `"${piece.id}": height set to ${height}pt to keep the picture's proportions (${file.width}×${file.height}).`,
      );
      piece.height = height;
    }
  }

  const { width, height } = pageSize(doc);
  if (
    !piece.anchor &&
    (piece.x > width || piece.y > height || piece.x + piece.width < 0 || piece.y + piece.height < 0)
  ) {
    throw new Error(
      `"${piece.id}" would sit off the page (${width}×${height}pt). Page coordinates run from 0,0 at the top-left.`,
    );
  }
  return piece;
}

/** Every piece in the call, merged onto the document's, checked, in the order sent. */
export async function settleArt(patches: ArtPatch[], doc: ResumeDoc, threadId: string) {
  const notes: string[] = [];
  const art = [...(doc.art ?? [])];
  const added: string[] = [];
  for (const patch of patches) {
    const at = art.findIndex((piece) => piece.id === patch.id);
    const piece = await settle(patch, art[at], doc, threadId, notes);
    if (at >= 0) art[at] = piece;
    else {
      art.push(piece);
      added.push(piece.id);
    }
  }
  return { art, added, notes };
}

const area = (box: { width: number; height: number }) =>
  Math.max(0, box.width) * Math.max(0, box.height);

function overlap(a: PdfBox, b: PdfBox) {
  if (a.page !== b.page) return 0;
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

const round = (n: number) => Math.round(n);

/** The parts of the resume a name stands for, for telling the model what something covers. */
export function partNames(doc: ResumeDoc): Record<string, string> {
  const names: Record<string, string> = { [boxIds.basics]: doc.basics.name || "the header" };
  for (const section of doc.sections) {
    names[boxIds.section(section.id)] = section.title;
    for (const item of section.items) names[boxIds.item(item.id)] = item.org || item.title;
  }
  for (const piece of doc.art ?? []) names[boxIds.art(piece.id)] = piece.label;
  return names;
}

/**
 * Where each piece landed on the drawn page, and what it now sits on: a
 * sticker in front of a line of text hides it, which is worth saying even
 * when it was meant.
 */
export function landing(ids: string[], doc: ResumeDoc, boxes: PdfBoxes, pages: number) {
  const names = partNames(doc);
  const { width, height } = pageSize(doc);
  const texts = Object.entries(boxes).filter(
    ([id]) => id.startsWith("item:") || id === boxIds.basics,
  );
  return ids.map((id) => {
    const piece = doc.art?.find((one) => one.id === id);
    const box = boxes[boxIds.art(id)];
    if (!piece) return { id, landed: false };
    if (!box) {
      return {
        id,
        landed: false,
        why: piece.anchor
          ? `nothing drew it: "${piece.anchor}" isn't on the page`
          : `nothing drew it: the resume has ${pages} page${pages === 1 ? "" : "s"}, and it is on page ${piece.page ?? 1}`,
      };
    }
    const covers =
      (piece.layer ?? "front") === "front"
        ? texts
            .filter(([, part]) => overlap(box, part) > area(box) * 0.12)
            .map(([part]) => names[part] ?? part)
        : [];
    const off =
      box.x < -1 || box.y < -1 || box.x + box.width > width + 1 || box.y + box.height > height + 1;
    return {
      id,
      landed: true,
      page: box.page + 1,
      at: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) },
      ...(covers.length ? { inFrontOf: covers } : {}),
      ...(off ? { note: "runs off the edge of the page" } : {}),
    };
  });
}
