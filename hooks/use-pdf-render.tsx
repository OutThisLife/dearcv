"use client";

import { useEffect, useRef, useState } from "react";
import { readPdfBoxes, type PdfBoxes } from "@/lib/resume/pdf-boxes";
import { isEmptyResume, type ResumeDoc } from "@/lib/resume/schema";
import { useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";

/** Long enough that a burst of tool edits becomes one drawing, not five. */
const SETTLE_MS = 80;

/**
 * Draws the document onto paper. The blob goes to the store, because the pane
 * and the Save button both want it; the geometry comes back here, because only
 * the marks drawn over this render can use it.
 */
export function usePdfRender(doc: ResumeDoc) {
  const generation = useRef(0);
  const [boxes, setBoxes] = useState<PdfBoxes>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const id = ++generation.current;
    let objectUrl = "";

    // Reached through the store rather than subscribed. An action never
    // changes identity, so listing one here says this redraws when the setter
    // moves, which cannot happen — it only obscures that the document is the
    // sole reason to draw again.
    const { setPreviewUrl } = useResumeStore.getState();

    setFailed(false);

    if (isEmptyResume(doc)) {
      setPreviewUrl(null);
      setBoxes({});
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
        objectUrl = URL.createObjectURL(blob);
        setBoxes(laidOut);
        setPreviewUrl(objectUrl);
      } catch (error) {
        // Left unhandled this waited forever on a page that was never coming,
        // while the transcript happily said the edit had landed.
        console.error("Couldn't draw the resume.", error);
        if (generation.current === id) setFailed(true);
      }
    }, SETTLE_MS);

    return () => {
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc]);

  return { boxes, failed };
}
