import type { ResumeDoc } from "./schema";

/**
 * Changing words the way an editor does: find this exact text, put that in
 * its place. A wording change no longer restates the whole entry it is in —
 * which is slow to write and is how the bullets nobody asked about drift —
 * and whatever an edit doesn't name can't change.
 *
 * Each edit is scoped to a part (`basics`, `section:<id>`, `item:<id>`,
 * `art:<id>` for a drawing's SVG) or, left out, to every word on the page.
 * The text must match exactly once there unless `all` is set, and the whole
 * call lands or none of it does, so a half-applied rewrite never reaches the
 * page. Matches never cross a field: a bullet is matched inside that bullet.
 */

export type TextEdit = { in?: string; find: string; replace: string; all?: boolean };

/** One piece of text an edit can reach, and the part of the page it sits in. */
type Field = { box: string; where: string; get: () => string; put: (text: string) => void };

const quote = (text: string, max = 80) =>
  JSON.stringify(text.length > max ? `${text.slice(0, max)}…` : text);

function fieldsOf(doc: ResumeDoc, scope: string | undefined): Field[] {
  const fields: Field[] = [];
  const add = (box: string, where: string, owner: Record<string, unknown>, key: string) => {
    if (typeof owner[key] !== "string") return;
    fields.push({
      box,
      where,
      get: () => owner[key] as string,
      put: (text) => {
        owner[key] = text;
      },
    });
  };
  const list = (box: string, where: string, items: string[] | undefined) =>
    items?.forEach((_, i) =>
      fields.push({
        box,
        where: `${where}[${i}]`,
        get: () => items[i]!,
        put: (text) => {
          items[i] = text;
        },
      }),
    );

  const basics = () => {
    const b = doc.basics as unknown as Record<string, unknown>;
    for (const key of ["name", "headline", "email", "phone", "location", "summary"]) {
      add("basics", key, b, key);
    }
    doc.basics.links.forEach((link, i) => {
      const l = link as unknown as Record<string, unknown>;
      add("basics", `links[${i}].label`, l, "label");
      add("basics", `links[${i}].href`, l, "href");
    });
  };
  const item = (section: ResumeDoc["sections"][number], index: number) => {
    const it = section.items[index]!;
    const box = `item:${it.id}`;
    const o = it as unknown as Record<string, unknown>;
    for (const key of ["title", "org", "href", "location", "start", "end"]) add(box, key, o, key);
    list(box, "bullets", it.bullets);
  };
  const section = (s: ResumeDoc["sections"][number]) => {
    const box = `section:${s.id}`;
    add(box, "title", s as unknown as Record<string, unknown>, "title");
    list(box, "lines", s.lines);
    s.items.forEach((_, i) => item(s, i));
  };

  if (!scope) {
    basics();
    doc.sections.forEach(section);
  } else if (scope === "basics") basics();
  else if (scope.startsWith("section:")) {
    const s = doc.sections.find((one) => `section:${one.id}` === scope);
    if (s) section(s);
  } else if (scope.startsWith("item:")) {
    for (const s of doc.sections) {
      const i = s.items.findIndex((one) => `item:${one.id}` === scope);
      if (i >= 0) item(s, i);
    }
  } else if (scope.startsWith("art:")) {
    const piece = doc.art?.find((one) => `art:${one.id}` === scope);
    if (piece) {
      const o = piece as unknown as Record<string, unknown>;
      add(scope, "label", o, "label");
      add(scope, "svg", o, "svg");
    }
  }
  return fields;
}

const count = (text: string, find: string) => text.split(find).length - 1;

/**
 * The part of the page a find points at, for showing it being worked on
 * while the call still streams in: its scope, or the first field holding the
 * text so far.
 */
export function whereIs(doc: ResumeDoc, edit: Partial<TextEdit> | undefined) {
  if (!edit) return undefined;
  if (edit.in) return fieldsOf(doc, edit.in).length ? edit.in : undefined;
  if (!edit.find || edit.find.length < 4) return undefined;
  return fieldsOf(doc, undefined).find((field) => field.get().includes(edit.find!))?.box;
}

/**
 * Where a near miss is, for a find that matched nothing: the same text in
 * another case, or the field whose words share the most with it. Enough for
 * the model to correct itself without reading the whole resume again.
 */
function nearMiss(fields: Field[], find: string) {
  const lower = find.toLowerCase();
  const cased = fields.find((field) => field.get().toLowerCase().includes(lower));
  if (cased) {
    const text = cased.get();
    const at = text.toLowerCase().indexOf(lower);
    return `It is there in another case: ${quote(text.slice(at, at + find.length))} in ${cased.box} ${cased.where}.`;
  }
  const words = new Set(lower.split(/\W+/).filter((word) => word.length > 3));
  let best: Field | undefined;
  let score = 0;
  for (const field of fields) {
    const shared = field
      .get()
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => words.has(word)).length;
    if (shared > score) [best, score] = [field, shared];
  }
  return best ? `Closest is ${best.box} ${best.where}: ${quote(best.get(), 160)}.` : "";
}

/**
 * Applies every edit to a copy of the document, in order, and returns it with
 * the parts each touched. Throws, in words the model can act on, at the first
 * edit that doesn't apply cleanly; the document passed in is never changed.
 */
export function applyTextEdits(doc: ResumeDoc, edits: TextEdit[]) {
  const next = structuredClone(doc);
  const touched: string[] = [];

  edits.forEach((edit, n) => {
    const label = edits.length > 1 ? `Edit ${n + 1}` : "The edit";
    if (!edit.find) throw new Error(`${label} has nothing to find.`);
    const fields = fieldsOf(next, edit.in);
    if (edit.in && !fields.length) {
      throw new Error(
        `${label}: there is no "${edit.in}" with text in it. Use basics, section:<id>, item:<id> or art:<id> from the resume, or leave "in" out to search the whole page.`,
      );
    }

    const hits = fields.filter((field) => field.get().includes(edit.find));
    const total = hits.reduce((sum, field) => sum + count(field.get(), edit.find), 0);
    if (!total) {
      const where = edit.in ? `in ${edit.in}` : "anywhere on the page";
      throw new Error(
        `${label}: ${quote(edit.find)} isn't ${where}. Copy the text exactly as it is now. ${nearMiss(fields, edit.find)}`.trim(),
      );
    }
    if (total > 1 && !edit.all) {
      const places = [...new Set(hits.map((field) => field.box))];
      const shown =
        places.slice(0, 6).join(", ") +
        (places.length > 6 ? `, and ${places.length - 6} more` : "");
      throw new Error(
        `${label}: ${quote(edit.find)} is there ${total} times (in ${shown}). Include more of the surrounding words, narrow it with "in", or set all to change every one.`,
      );
    }

    for (const field of hits) {
      field.put(field.get().split(edit.find).join(edit.replace));
      if (!touched.includes(field.box)) touched.push(field.box);
    }
  });

  // A bullet or line edited down to nothing is a bullet taken out.
  for (const section of next.sections) {
    if (section.lines) section.lines = section.lines.filter((line) => line.trim());
    for (const item of section.items) item.bullets = item.bullets.filter((bullet) => bullet.trim());
  }

  return { doc: next, touched };
}
