import { create } from "zustand";
import type { PdfBoxes } from "@/lib/resume/pdf-boxes";
import type { ResumeDoc } from "@/lib/resume/schema";

/**
 * The page as last drawn: where every part landed, how many pages it took,
 * and which document that was. Kept in a store rather than in the preview,
 * because the agent's tools need it too — to place art against what is
 * actually on the paper, and to look at the page once an edit has landed.
 */
type LayoutState = {
  boxes: PdfBoxes;
  pages: number;
  /** The document this drawing is of: the very object, once it has caught up with the store's. */
  doc: ResumeDoc | null;
  /** When the document it describes arrived. */
  at: number;
  /** Why the last drawing failed, when it did. */
  error: string | null;
  /** The drawn PDF, for anything that wants to look at it. */
  url: string | null;
};

export const useLayoutStore = create<LayoutState>()(() => ({
  boxes: {},
  pages: 0,
  doc: null,
  at: 0,
  error: null,
  url: null,
}));

/**
 * Resolves once this exact document is on paper — or failed to get there —
 * so a tool can report where things actually landed rather than where it
 * meant them to. Gives up after `timeoutMs` and reports what it has.
 */
export function whenDrawn(doc: ResumeDoc, timeoutMs = 8000) {
  return new Promise<LayoutState>((resolve) => {
    const now = useLayoutStore.getState();
    if (now.doc === doc && (now.url || now.error)) return resolve(now);
    let timer = 0;
    const unsubscribe = useLayoutStore.subscribe((state) => {
      if (state.doc !== doc || (!state.url && !state.error)) return;
      window.clearTimeout(timer);
      unsubscribe();
      resolve(state);
    });
    timer = window.setTimeout(() => {
      unsubscribe();
      resolve(useLayoutStore.getState());
    }, timeoutMs);
  });
}
