import { create } from "zustand";

/**
 * What the agent just touched, so you see an edit land instead of hunting for
 * it. Marks are keyed by resume id, not by rectangle: the PDF is regenerated
 * on every change, so a mark held as coordinates would point at stale paper.
 * The preview resolves ids against the current layout on each paint, which is
 * what lets a mark ride the reflow its own edit caused.
 *
 * A mark lives as long as its flash does, and the flash only starts once the
 * page it points into has been redrawn — on a slow redraw a fixed timer ran
 * out before there was anything to flash. The preview says when it is done.
 */

/**
 * pen.dev's flash envelope: the outline snaps in, holds while one scan passes
 * down through it, and lets go — under a second, gone before it can feel like
 * a highlight left on. The preview's keyframes are cut to these.
 */
export const FLASH = { attackMs: 200, holdMs: 400, releaseMs: 300 } as const;

/** pen's one sweep through what changed, and the beat before it starts. */
export const SCAN = { delayMs: 40, sweepMs: 300 } as const;

/** For a mark that never finds a box — what it pointed at was removed — so it cannot linger. */
const GIVE_UP_MS = 10_000;

export type Mark = { id: string; at: number };

type MarksState = {
  marks: Mark[];
  /** `drawn`: what it points at is on the paper already, so it flashes now rather than after the next redraw. */
  mark: (id: string, options?: { drawn?: boolean }) => void;
  /** The preview, once this mark's flash has played. A newer mark of the same id stays. */
  unmark: (mark: Mark) => void;
  clearMarks: () => void;
};

export const useMarksStore = create<MarksState>()((set, get) => ({
  marks: [],
  mark: (id, options) => {
    // Already drawn, it is stamped as from before any drawing, which the
    // preview takes as on the page now.
    const mark = { id, at: options?.drawn ? 0 : Date.now() };
    set((state) => ({ marks: [...state.marks.filter((one) => one.id !== id), mark] }));
    window.setTimeout(() => get().unmark(mark), GIVE_UP_MS);
  },
  unmark: (mark) =>
    set((state) =>
      state.marks.includes(mark) ? { marks: state.marks.filter((one) => one !== mark) } : state,
    ),
  clearMarks: () => set((state) => (state.marks.length ? { marks: [] } : state)),
}));
