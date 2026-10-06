"use client";

import { useEffect, useRef, useState } from "react";
import { artSources } from "@/lib/resume/art";
import { readPdfBoxes, type PdfBoxes } from "@/lib/resume/pdf-boxes";
import type { ArtFiles } from "@/lib/resume/pdf-document";
import { isEmptyResume, type ResumeDoc } from "@/lib/resume/schema";
import { resolvePicture, useAssetsStore } from "@/lib/store/assets";
import { useLayoutStore } from "@/lib/store/layout";
import { useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";
import { useThreadStore } from "@/lib/store/thread";

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

/** Every picture the document shows, fetched if it has to be, by the name the document uses. */
async function picturesFor(doc: ResumeDoc): Promise<ArtFiles> {
  const threadId = useThreadStore.getState().id;
  const sources = artSources(doc.art);
  const files = await Promise.all(sources.map((key) => resolvePicture(key, threadId)));
  return Object.fromEntries(
    sources.flatMap((key, i) => (files[i] ? [[key, files[i]!.data] as const] : [])),
  );
}

/** What a page count is, read off react-pdf's laid-out tree. */
const pageCount = (layout: unknown) =>
  ((layout as { children?: unknown[] } | undefined)?.children ?? []).length;

/**
 * Draws the document onto paper. The blob goes to the store, because the pane
 * and the Save button both want it; the geometry comes back here, because only
 * the marks drawn over this render can use it — and to the layout store, for
 * the agent's tools to place things against.
 */
export function usePdfRender(doc: ResumeDoc) {
  const generation = useRef(0);
  // Kept with the moment the document they describe arrived, so anything
  // pointed at an edit can wait for the drawing that has it in.
  const [drawn, setDrawn] = useState<{ boxes: PdfBoxes; at: number }>({ boxes: {}, at: 0 });
  const [failed, setFailed] = useState(false);
  // A picture arriving is a reason to draw again, though the document is the same.
  const pictures = useAssetsStore((s) => s.files);

  // The last drawing goes with the pane.
  useEffect(() => () => showPreview(null), []);

  useEffect(() => {
    const id = ++generation.current;
    const at = Date.now();

    setFailed(false);

    if (isEmptyResume(doc)) {
      showPreview(null);
      setDrawn({ boxes: {}, at });
      useLayoutStore.setState({ boxes: {}, pages: 0, doc, at, error: null, url: null });
      useMarksStore.getState().clearMarks();
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const { pdf } = await import("@react-pdf/renderer");
        const { ResumePdf } = await import("@/lib/resume/pdf-document");
        const files = await picturesFor(doc);
        if (generation.current !== id) return;

        // The laid-out tree arrives on the same pass that makes the blob, so
        // the geometry always describes the paper we are about to show.
        let laidOut: PdfBoxes = {};
        let pages = 0;
        const blob = await pdf(
          <ResumePdf
            doc={doc}
            files={files}
            onRender={(params) => {
              const layout = (params as { _INTERNAL__LAYOUT__DATA_?: unknown })
                ._INTERNAL__LAYOUT__DATA_;
              laidOut = readPdfBoxes(layout);
              pages = pageCount(layout);
            }}
          />,
        ).toBlob();

        if (generation.current !== id) return;
        const url = URL.createObjectURL(blob);
        setDrawn({ boxes: laidOut, at });
        showPreview(url);
        useLayoutStore.setState({ boxes: laidOut, pages, doc, at, error: null, url });
      } catch (error) {
        // Left unhandled this waited forever on a page that was never coming,
        // while the transcript happily said the edit had landed.
        console.error("Couldn't draw the resume.", error);
        if (generation.current !== id) return;
        setFailed(true);
        useLayoutStore.setState({
          doc,
          at,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [doc, pictures]);

  return { boxes: drawn.boxes, drawnAt: drawn.at, failed };
}
