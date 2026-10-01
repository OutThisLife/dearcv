import { useEffect, useRef, useState } from "react";

export type SwapPhase = "idle" | "exit" | "enter";

/**
 * transitions.dev's three-beat text swap: the old value leaves, the new one
 * is put in place out of sight, then let go to settle in. Returns the value
 * to show and the beat it is on, for styles to key off. A change that lands
 * mid-swap just restarts the exit and ends on the newest value.
 */
export function useSwap<T>(value: T, exitMs: number) {
  const [shown, setShown] = useState(value);
  const [phase, setPhase] = useState<SwapPhase>("idle");
  const settled = useRef(value);

  useEffect(() => {
    if (Object.is(value, settled.current)) {
      // Back where it started before the old value finished leaving.
      setPhase("idle");
      return;
    }
    setPhase("exit");
    let frame = 0;
    const timer = window.setTimeout(() => {
      settled.current = value;
      setShown(value);
      setPhase("enter");
      // Two frames: one to paint the starting position, one to leave it.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setPhase("idle"));
      });
    }, exitMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, exitMs]);

  return { shown, phase };
}
