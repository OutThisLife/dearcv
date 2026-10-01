"use client";

import { useEffect, useRef, useState } from "react";
import { readPdfBoxes, type PdfBoxes } from "@/lib/resume/pdf-boxes";
import { isEmptyResume, type ResumeDoc } from "@/lib/resume/schema";
import { useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";

/** Long enough that a burst of tool edits becomes one drawing, not five. */
const SETTLE_MS = 80;

/**
 * Puts a new drawing up and only then lets the old one go. Until its
 * replacement lands the old blob is still the page on screen and the file
 * Save hands over; revoking it as soon as the document changed left a window
 * where a repaint or a download reached for a file that was already gone.
 */
function showPreview(url: string | null) {
  const { previewUrl, setPreviewUrl } = useResumeStore.getState();
  setPreviewUrl(url);
  if (previewUrl && previewUrl !== url) URL.revokeObjectURL(previewUrl);
}

/**
 * Draws the document onto paper. The blob goes to the store, because the pane
 * and the Save button both want it; the geometry comes back here, because only
 * the marks drawn over this render can use it.
 */
export function usePdfRender(doc: ResumeDoc) {
  const generation = useRef(0);
  // Kept with the moment the document they describe arrived, so anything
  // pointed at an edit can wait for the drawing that has it in.
  const [drawn, setDrawn] = useState<{ boxes: PdfBoxes; at: number }>({ boxes: {}, at: 0 });
  const [failed, setFailed] = useState(false);

  // The last drawing goes with the pane.
  useEffect(() => () => showPreview(null), []);

  useEffect(() => {
    const id = ++generation.current;
    const at = Date.now();

    setFailed(false);

    if (isEmptyResume(doc)) {
      showPreview(null);
      setDrawn({ boxes: {}, at });
      useMarksStore.getState().clearMarks();
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const { pdf } = await import("@react-pdf/renderer");
        const { ResumePdf } = await import("@/lib/resume/pdf-document");

        // The laid-out tree arrives on the same pass that makes the blob, so
        // the geometry always describes the paper we are about to show.
        let laidOut: PdfBoxes = {};
        const blob = await pdf(
          <ResumePdf
            doc={doc}
            onRender={(params) => {
              laidOut = readPdfBoxes(
                (params as { _INTERNAL__LAYOUT__DATA_?: unknown })._INTERNAL__LAYOUT__DATA_,
              );
            }}
          />,
        ).toBlob();

        if (generation.current !== id) return;
        setDrawn({ boxes: laidOut, at });
        showPreview(URL.createObjectURL(blob));
      } catch (error) {
        // Left unhandled this waited forever on a page that was never coming,
        // while the transcript happily said the edit had landed.
        console.error("Couldn't draw the resume.", error);
        if (generation.current === id) setFailed(true);
      }
    }, SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [doc]);

  return { boxes: drawn.boxes, drawnAt: drawn.at, failed };
}
