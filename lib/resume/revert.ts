import type { ResumeDoc, ResumeSection } from "@/lib/resume/schema";

/**
 * Taking back one request's changes without taking back anyone else's.
 *
 * History is a line, and stepping back along it undoes everything after the
 * point stepped to. That is right for ⌘Z and wrong for a comment: two
 * comments work at the same time, and undoing the first must leave what the
 * second did alone. So a comment's change is taken back by part — the
 * header, the look, a section's own heading, an entry — putting each part it
 * touched back the way it was before it, and leaving every other part as it
 * now stands.
 */

/** Which parts of a resume differ between two versions of it. */
export type Parts = {
  basics: boolean;
  theme: boolean;
  /** Sections whose own fields — title, kind, lines — or existence changed. */
  sections: Set<string>;
  /** Entries that changed, appeared or went. */
  items: Set<string>;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A section without its entries: what is its own. */
const own = ({ items: _items, ...rest }: ResumeSection) => rest;

const itemsOf = (doc: ResumeDoc) =>
  new Map(
    doc.sections.flatMap((section) =>
      section.items.map((item, index) => [item.id, { item, section: section.id, index }] as const),
    ),
  );

export function partsChanged(before: ResumeDoc, after: ResumeDoc): Parts {
  const sections = new Set<string>();
  const ids = new Set([...before.sections, ...after.sections].map((section) => section.id));
  for (const id of ids) {
    const was = before.sections.find((section) => section.id === id);
    const is = after.sections.find((section) => section.id === id);
    if (!was || !is || !same(own(was), own(is))) sections.add(id);
  }

  const items = new Set<string>();
  const wasItems = itemsOf(before);
  const isItems = itemsOf(after);
  for (const id of new Set([...wasItems.keys(), ...isItems.keys()])) {
    const was = wasItems.get(id);
    const is = isItems.get(id);
    if (!was || !is || was.section !== is.section || !same(was.item, is.item)) items.add(id);
  }

  return {
    basics: !same(before.basics, after.basics),
    theme: !same(before.theme, after.theme),
    sections,
    items,
  };
}

/**
 * `current`, with the given parts as they are in `source`: what was there is
 * put back where it stood, what was not is taken out. Sections go first, so
 * an entry restored into a section that was removed has somewhere to land.
 */
export function restoreParts(current: ResumeDoc, source: ResumeDoc, parts: Parts): ResumeDoc {
  let sections = current.sections.map((section) => ({ ...section, items: [...section.items] }));

  for (const id of parts.sections) {
    const from = source.sections.findIndex((section) => section.id === id);
    const at = sections.findIndex((section) => section.id === id);
    if (from < 0) {
      if (at >= 0) sections.splice(at, 1);
      continue;
    }
    const wanted = source.sections[from]!;
    if (at >= 0) {
      // Its own fields come back; its entries stay as they now are, since
      // another request may have changed those.
      sections[at] = { ...own(wanted), items: sections[at]!.items };
    } else {
      // Back in, empty: its entries are among the changed parts, and are
      // put back below, each in its place.
      sections.splice(Math.min(from, sections.length), 0, { ...own(wanted), items: [] });
    }
  }

  const wanted = itemsOf(source);
  for (const id of parts.items) {
    sections = sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => item.id !== id),
    }));
    const was = wanted.get(id);
    const home = was && sections.find((section) => section.id === was.section);
    if (was && home) home.items.splice(Math.min(was.index, home.items.length), 0, was.item);
  }

  return {
    ...current,
    basics: parts.basics ? source.basics : current.basics,
    theme: parts.theme ? source.theme : current.theme,
    sections,
  };
}
