import type { LayoutRun } from "@/lib/resume/read-pdf";

/**
 * Where on the uploaded page the model has got to while transcribing it.
 *
 * The transcription arrives as text, a few words at a time, in reading order;
 * the page is runs of text with positions. Following one with the other is a
 * matter of finding the newest words among the runs — always forward from the
 * last find, since a resume is copied top to bottom and a phrase that recurs
 * ("Senior Full Stack Engineer") means its next appearance, not its first.
 */

const norm = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** How far ahead a match may be: further than this, it is the same words somewhere else. */
const LOOKAHEAD_RUNS = 60;

/**
 * The run the newest text is in, searching forward from `from`; `from` again
 * if it cannot be placed. Tries the last three words, then two, then one —
 * a phrase can wrap across lines, and the last word is usually still arriving,
 * which is fine: a word's beginning is still inside the run.
 */
export function advanceHead(runs: LayoutRun[], from: number, text: string) {
  const words = norm(text).split(" ").filter(Boolean);
  const start = Math.max(from, 0);
  const end = Math.min(runs.length, start + LOOKAHEAD_RUNS);

  for (const take of [3, 2, 1]) {
    const phrase = words.slice(-take).join(" ");
    if (phrase.length < (take === 1 ? 4 : 3)) continue;
    for (let i = start; i < end; i++) {
      if (norm(runs[i]!.text).includes(phrase)) return i;
    }
  }
  return from;
}

/** Fields that are ours, not the page's: they name things rather than copy them. */
const NOT_ON_THE_PAGE = new Set(["id", "kind", "before"]);

/**
 * The last thing written down so far in a resume arriving as partial JSON —
 * a transcription, or a whole-resume edit streaming in: the deepest, latest
 * string in it.
 */
export function latestText(value: unknown, key = ""): string | undefined {
  if (typeof value === "string") return NOT_ON_THE_PAGE.has(key) ? undefined : value;
  const entries = Array.isArray(value)
    ? value.map((one, i) => [String(i), one] as const)
    : value && typeof value === "object"
      ? Object.entries(value)
      : [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const [childKey, child] = entries[i]!;
    const found = latestText(child, Array.isArray(value) ? key : childKey);
    if (found) return found;
  }
  return undefined;
}
