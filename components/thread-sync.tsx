"use client";

import { useEffect } from "react";
import { useResumeStore } from "@/lib/store/resume";
import { useThreadStore } from "@/lib/store/thread";

/** Long enough to swallow a burst of tool edits, short enough to survive a tab close. */
const SETTLE_MS = 800;

/**
 * Gives a thread an address once it is worth keeping, then writes the resume
 * side of it as it changes. The chat side is written server-side as each turn
 * finishes, so nothing here touches messages.
 */
export function ThreadSync() {
  const id = useThreadStore((s) => s.id);
  const addressed = useThreadStore((s) => s.addressed);

  // Swapping the URL under a live thread would remount the tree and drop the
  // conversation, so it goes through history directly rather than the router.
  useEffect(() => {
    if (!addressed || !id) return;
    const url = `/t/${id}`;
    if (window.location.pathname !== url) window.history.replaceState(null, "", url);
  }, [addressed, id]);

  // Held back until the thread is worth keeping, so a PDF dropped in and then
  // abandoned never reaches storage.
  useEffect(() => {
    if (!addressed) return;

    const { file, pdfUrl } = useResumeStore.getState();
    if (!file || pdfUrl) return;

    let cancelled = false;
    void (async () => {
      try {
        const { upload } = await import("@vercel/blob/client");
        const { url } = await upload(file.name, file, {
          access: "public",
          contentType: "application/pdf",
          handleUploadUrl: "/api/blob/upload",
        });
        // The local blob: URL still draws the preview, so a failure here costs
        // the reload, not the session.
        if (!cancelled) useResumeStore.getState().setPdfUrl(url);
      } catch {
        // Storage isn't configured, or the upload was refused. Either way the
        // thread still works for as long as the tab is open.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addressed]);

  useEffect(() => {
    if (!addressed || !id) return;

    let timer = 0;
    const save = () => {
      const { doc, sourceText, sourceName, pdfUrl } = useResumeStore.getState();
      void fetch(`/api/thread/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc, sourceText, sourceName, pdfUrl }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, SETTLE_MS);
    };

    // The first write is what creates the row, so it does not wait.
    save();

    const unsubscribe = useResumeStore.subscribe(schedule);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [addressed, id]);

  return null;
}
