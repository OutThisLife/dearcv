import { create } from "zustand";
import { changedBoxes } from "@/lib/resume/pdf-boxes";
import type { ResumeDoc } from "@/lib/resume/schema";
import { useActivityStore } from "@/lib/store/activity";
import { useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";
import { useThreadStore } from "@/lib/store/thread";

/**
 * Every state the resume has been in this session, to step back and forth
 * through. A step is one request: every edit a reply makes for a message
 * lands in the same revision, so undo takes back what was asked for, not a
 * quarter of it. Each is named in the person's own words, since those are
 * what they will recognise when they come looking. Stepping only moves which
 * revision is on the page; an edit made from an earlier one drops the ones
 * after it, the way undo does everywhere else.
 *
 * Kept per document: a new upload, a fresh start or another thread is a
 * different resume, and its first edit starts a new history.
 */
export type Revision = {
  doc: ResumeDoc;
  /** Carried with it, so stepping back to the start shows their own file again. */
  touched: boolean;
  /** The message that asked for it, or a summary of `changes` when nothing did. */
  label: string;
  /** What it did, one entry per thing touched, in order. */
  changes: string[];
  /** The message it answers, so a reply's later edits fold into it. */
  request?: string;
};

/** The message an edit is answering. */
export type Ask = { id: string; text: string };

/** Plenty to wander back through, without holding every draft of a long session. */
const LIMIT = 100;

type HistoryState = {
  revisions: Revision[];
  at: number;
  /** Which resume the revisions are of. */
  owner: string;
  /** Before an edit: makes sure the state it starts from can be returned to. */
  begin: () => void;
  /** After an edit: the page as it now stands, what was done, and for which message. */
  record: (change: string, ask?: Ask) => void;
  go: (at: number) => void;
};

/**
 * Which resume is on screen: the thread, and the file it came from. Anything
 * kept per document — its history, its comments — is filed under this and
 * set aside when it changes.
 */
export const documentKey = () => {
  const { originalUrl, sourceName } = useResumeStore.getState();
  return `${useThreadStore.getState().id}|${originalUrl ?? ""}|${sourceName}`;
};

/** The same, subscribed, for anything that shows per-document state. */
export function useDocumentKey() {
  const originalUrl = useResumeStore((s) => s.originalUrl);
  const sourceName = useResumeStore((s) => s.sourceName);
  const threadId = useThreadStore((s) => s.id);
  return `${threadId}|${originalUrl ?? ""}|${sourceName}`;
}

const summary = (changes: string[]) =>
  changes.length > 1 ? `${changes[0]} +${changes.length - 1} more` : (changes[0] ?? "");

const current = (): Revision => {
  const { doc, touched, originalUrl } = useResumeStore.getState();
  return { doc, touched, label: originalUrl && !touched ? "Original" : "Start", changes: [] };
};

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  revisions: [],
  at: 0,
  owner: "",
  begin: () => {
    const owner = documentKey();
    if (get().owner === owner && get().revisions.length) return;
    set({ owner, revisions: [current()], at: 0 });
  },
  record: (change, ask) => {
    const { revisions, at } = get();
    const { doc, touched } = useResumeStore.getState();
    const here = revisions[at];
    // A tool that changed nothing — a failed lookup, a no-op patch — is not a step.
    if (!here || here.doc === doc) return;

    // Another edit from the reply that made this revision: fold it in. Only
    // from the newest, though — stepping back mid-reply and the reply then
    // editing again branches, like any edit made from the past.
    if (ask && here.request === ask.id && at === revisions.length - 1) {
      const changes = here.changes.includes(change) ? here.changes : [...here.changes, change];
      const label = ask.text || summary(changes);
      set({ revisions: [...revisions.slice(0, at), { ...here, doc, touched, changes, label }] });
      return;
    }

    const step: Revision = {
      doc,
      touched,
      label: ask?.text || change,
      changes: [change],
      request: ask?.id,
    };
    const next = [...revisions.slice(0, at + 1), step].slice(-LIMIT);
    set({ revisions: next, at: next.length - 1 });
  },
  go: (to) => {
    const { revisions, at } = get();
    const revision = revisions[to];
    if (!revision || to === at) return;
    // Replays what differs between the two, the way the edit showed it the
    // first time: flashed and scanned, with the agent's cursor sent over.
    const changed = changedBoxes(revisions[at].doc, revision.doc);
    useResumeStore.setState({ doc: revision.doc, touched: revision.touched });
    const marks = useMarksStore.getState();
    marks.clearMarks();
    changed.forEach(marks.mark);
    if (changed[0]) useActivityStore.getState().point(changed[0]);
    set({ at: to });
  },
}));

/**
 * The revisions of the resume on screen. Another upload or thread leaves the
 * old ones in the store until its first edit replaces them, so they are
 * matched to the resume here rather than trusted.
 */
export function useRevisions() {
  const revisions = useHistoryStore((s) => s.revisions);
  const at = useHistoryStore((s) => s.at);
  const owner = useHistoryStore((s) => s.owner);
  const live = owner === useDocumentKey();

  return live ? { revisions, at } : { revisions: [], at: 0 };
}
