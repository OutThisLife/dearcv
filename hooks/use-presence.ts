import { useEffect, useState } from "react";

/**
 * Keeps something on screen long enough to animate out. Entering needs no
 * help — `starting:` styles cover a fresh mount — but leaving does: unmount
 * at once and there is nothing left to fade. `closing` is the window to play
 * the exit in; after `exitMs` it is gone.
 */
export function usePresence(show: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(show);
  // Adjusting state from a changed prop during render, as React recommends,
  // so an entrance never waits a frame on an effect.
  if (show && !mounted) setMounted(true);

  useEffect(() => {
    if (show) return;
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [show, exitMs]);

  return { mounted, closing: mounted && !show };
}
