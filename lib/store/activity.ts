import { create } from "zustand";

/**
 * What the agent is working on right now, so the page shows it happening and
 * not only once it is done. Each tool call names the part of the resume its
 * arguments point at while they are still streaming in; the preview glows
 * that part until the call lands, when the mark of the finished edit takes
 * over. `boxIds.page` stands for the whole document.
 *
 * While an upload is being transcribed, `head` is the line of it the model
 * has reached — a run of the uploaded page's own text — so the page follows
 * the model through it rather than playing something on a timer.
 *
 * Also where the agent's cursor is headed: the last thing it touched or
 * started on, or the head. The cursor is presence, not a pointer anyone
 * uses, so it is only ever set from here.
 */

/** The cursor's target while it follows the transcription. */
export const HEAD = "head";

type ActivityState = {
  /** Tool call id → the box id it is working on. */
  working: Record<string, string>;
  /** Where the cursor is going, and when it was sent, so the same target twice still moves it. */
  cursor: { target: string; at: number } | null;
  /** Index into the upload's layout runs, while it is being transcribed. */
  head: number | null;
  work: (call: string, target: string) => void;
  done: (call: string) => void;
  point: (target: string) => void;
  readTo: (run: number | null) => void;
};

export const useActivityStore = create<ActivityState>()((set) => ({
  working: {},
  cursor: null,
  head: null,
  work: (call, target) =>
    set((state) =>
      state.working[call] === target
        ? state
        : { working: { ...state.working, [call]: target }, cursor: { target, at: Date.now() } },
    ),
  done: (call) =>
    set((state) => {
      if (!(call in state.working)) return state;
      const { [call]: _, ...working } = state.working;
      return { working };
    }),
  point: (target) => set({ cursor: { target, at: Date.now() } }),
  readTo: (run) =>
    set((state) =>
      state.head === run
        ? state
        : { head: run, ...(run === null ? {} : { cursor: { target: HEAD, at: Date.now() } }) },
    ),
}));
