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
  const file = useResumeStore((s) => s.file);
  const pdfUrl = useResumeStore((s) => s.pdfUrl);

  // Swapping the URL under a live thread would remount the tree and drop the
  // conversation, so it goes through history directly rather than the router.
  useEffect(() => {
    if (!addressed || !id) return;
    const url = `/t/${id}`;
    if (window.location.pathname !== url) window.history.replaceState(null, "", url);
  }, [addressed, id]);

  // Waits for the thread to be worth keeping, so a PDF dropped in and then
  // abandoned never reaches storage — but then watches for the file rather than
  // reading it once, because it just as often arrives after the first message
  // as before it. The object URL draws the preview throughout, which is why a
  // PDF that never made it up still looked fine until the page was reloaded.
  useEffect(() => {
    if (!addressed || !file || pdfUrl) return;

    let cancelled = false;
    void (async () => {
      try {
        const { upload } = await import("@vercel/blob/client");
        const { url } = await upload(file.name, file, {
          access: "public",
          contentType: "application/pdf",
          handleUploadUrl: "/api/blob/upload",
        });
        if (!cancelled) useResumeStore.getState().setPdfUrl(url);
      } catch (error) {
        // Costs the reload, not the session: the thread still works for as long
        // as the tab is open. Worth saying out loud either way.
        console.error("Couldn't store that PDF.", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addressed, file, pdfUrl]);

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
