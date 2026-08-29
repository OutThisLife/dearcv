import { create } from "zustand";

/**
 * What the agent just touched, so you see an edit land instead of hunting for
 * it. Marks are keyed by resume id, not by rectangle: the PDF is regenerated
 * on every change, so a mark held as coordinates would point at stale paper.
 * The preview resolves ids against the current layout on each paint, which is
 * what lets a mark ride the reflow its own edit caused.
 */
const DWELL_MS = 2600;

type MarksState = {
  marks: string[];
  mark: (id: string) => void;
  clearMarks: () => void;
};

const timers = new Map<string, number>();

export const useMarksStore = create<MarksState>()((set) => ({
  marks: [],
  mark: (id) => {
    const running = timers.get(id);
    if (running) window.clearTimeout(running);

    set((state) => (state.marks.includes(id) ? state : { marks: [...state.marks, id] }));

    timers.set(
      id,
      window.setTimeout(() => {
        timers.delete(id);
        set((state) => ({ marks: state.marks.filter((one) => one !== id) }));
      }, DWELL_MS),
    );
  },
  clearMarks: () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    set((state) => (state.marks.length ? { marks: [] } : state));
  },
}));
