import type { UIMessage } from "ai";
import { create } from "zustand";

/**
 * A session replay (`?replay` on a thread, `?replay=2` for twice the pace):
 * the conversation and the page walked through again from the start, each
 * request said, answered and landing on the page in the order it happened.
 *
 * While one plays nothing else may write to the thread — no saves, no
 * automatic follow-up turns — since what is on screen is the past. Anything
 * the person does to the conversation or the history takes over: the replay
 * skips to where the session was left, then does what they asked.
 */
export type ReplayScript = {
  messages: UIMessage[];
  /** The history step the session was left on, which is where it ends. */
  at: number;
  speed: number;
};

type ReplayState = {
  active: boolean;
  script: ReplayScript | null;
  /** Ends it at once, on the session as it was left. Set by the player. */
  skip: (() => void) | null;
};

export const useReplayStore = create<ReplayState>()(() => ({
  active: false,
  script: null,
  skip: null,
}));

export const replaying = () => useReplayStore.getState().active;

/** Takes over from a replay, if one is playing. */
export const takeOver = () => useReplayStore.getState().skip?.();

/** Whether this page was opened to replay, and how fast. */
export function replaySpeed(): number | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("replay");
  if (param === null) return null;
  const speed = Number(param);
  return Number.isFinite(speed) && speed > 0 ? Math.min(speed, 10) : 1;
}
