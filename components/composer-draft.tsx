"use client";

import { useAui, useAuiEvent, useAuiState } from "@assistant-ui/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  clearComposerDraft,
  migrateComposerDraft,
  stashComposerDraft,
  takeComposerDraft,
} from "@/lib/store/composer-draft";
import { useThreadStore } from "@/lib/store/thread";

const PERSIST_MS = 400;

/**
 * Same idea as the Hermes composer stash: type, refresh, the draft is still
 * there. Unsent home threads share one key because `/` mints a new id every
 * load. Sending clears it.
 */
export function ComposerDraft() {
  const aui = useAui();
  const text = useAuiState((s) => s.composer.text);
  const id = useThreadStore((s) => s.id);
  const addressed = useThreadStore((s) => s.addressed);
  const ready = useRef(false);

  useLayoutEffect(() => {
    const draft = takeComposerDraft(id, addressed);
    if (draft) {
      try {
        aui.composer().setText(draft);
      } catch {
        // Runtime not bound yet — the next persist pass is a no-op on empty.
      }
    }
    ready.current = true;
    // Once per mount — this tab's thread id does not change.
  }, []);

  useEffect(() => {
    if (!addressed || !id) return;
    migrateComposerDraft(id);
  }, [addressed, id]);

  useEffect(() => {
    if (!ready.current) return;
    const timer = window.setTimeout(() => stashComposerDraft(id, addressed, text), PERSIST_MS);
    return () => window.clearTimeout(timer);
  }, [addressed, id, text]);

  useEffect(() => {
    const flush = () => stashComposerDraft(id, addressed, text);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [addressed, id, text]);

  useAuiEvent("composer.send", () => {
    clearComposerDraft(id, addressed);
  });

  return null;
}
