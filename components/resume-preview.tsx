"use client";

import { useEffect, useRef, useState } from "react";
import { PdfFileIcon } from "@/components/pdf-file-icon";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Thinking } from "@/components/ui/thinking";
import { pickPdf } from "@/lib/resume/ingest";
import { ResumePdf } from "@/lib/resume/pdf-document";
import { readPdfBoxes, type PdfBoxes } from "@/lib/resume/pdf-boxes";
import { isEmptyResume } from "@/lib/resume/schema";
import { useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";
import { cn } from "@/lib/utils";

/** Where a rendered page sits in the scroller, and its PDF-point-to-pixel scale. */
type PageBox = { top: number; scale: number };

export function ResumePreview() {
  const doc = useResumeStore((s) => s.doc);
  const originalUrl = useResumeStore((s) => s.originalUrl);
  const previewUrl = useResumeStore((s) => s.previewUrl);
  const setPreviewUrl = useResumeStore((s) => s.setPreviewUrl);
  const ingesting = useResumeStore((s) => s.ingesting);
  const marks = useMarksStore((s) => s.marks);
  const clearMarks = useMarksStore((s) => s.clearMarks);
  const generation = useRef(0);
  const pagesRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const [boxes, setBoxes] = useState<PdfBoxes>({});
  const [pages, setPages] = useState<PageBox[]>([]);

  // Until the upload is parsed into an editable doc, show the file as-is.
  const renderUrl = isEmptyResume(doc) ? originalUrl : previewUrl;
  const empty = !renderUrl && !ingesting;

  useEffect(() => {
    const id = ++generation.current;
    let objectUrl = "";

    if (isEmptyResume(doc)) {
      setPreviewUrl(null);
      setBoxes({});
      clearMarks();
      return;
    }

    const timer = window.setTimeout(async () => {
      const { pdf } = await import("@react-pdf/renderer");
      // The laid-out tree arrives on the same pass that makes the blob, so the
      // geometry always describes the paper we are about to show.
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
    }, 80);

    return () => {
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc, setPreviewUrl, clearMarks]);

  useEffect(() => {
    const host = pagesRef.current;
    if (!renderUrl || !host) return;

    let cancelled = false;
    let timer = 0;

    const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    const paint = async () => {
      const width = host.clientWidth;
      if (width < rem() * 0.5) return;
      widthRef.current = width;

      const { getDocumentProxy } = await import("unpdf");
      const bytes = new Uint8Array(await (await fetch(renderUrl)).arrayBuffer());
      if (cancelled) return;

      const pdf = await getDocumentProxy(bytes);
      if (cancelled) {
        await pdf.cleanup();
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const points: number[] = [];
      host.replaceChildren();

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width * dpr) / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        canvas.style.display = "block";
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        if (cancelled) break;
        points.push(base.width);
        host.appendChild(canvas);
      }

      await pdf.cleanup();
      if (cancelled) return;

      // Measure the painted canvases rather than adding up heights, so the
      // marks cannot drift a subpixel per page down a long resume.
      setPages(
        Array.from(host.children).map((child, i) => {
          const canvas = child as HTMLCanvasElement;
          return { top: canvas.offsetTop, scale: canvas.clientWidth / points[i] };
        }),
      );
    };

    void paint();

    const ro = new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - widthRef.current) < rem() * 0.125) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void paint();
      }, 80);
    });
    ro.observe(host);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [renderUrl]);

  return (
    // The scroller is nested so the ingest overlay can pin to the pane. As a
    // child of the scroller it would stretch to the full page stack and centre
    // itself somewhere down around page two.
    <div className="relative min-h-0 flex-1">
      <div className={cn("h-full overflow-auto", empty ? "bg-background" : "bg-muted/30")}>
        {empty ? (
          <button
            type="button"
            onClick={pickPdf}
            className="hover:bg-muted/40 min-h-full w-full cursor-pointer transition-colors"
          >
            <EmptyState
              className="min-h-full"
              icon={<PdfFileIcon />}
              description="Drop your resume here and I'll keep its design. Or say the word and we'll start one together."
              action={
                <span className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Choose a file
                </span>
              }
            />
          </button>
        ) : renderUrl ? (
          <div className="relative min-h-full w-full">
            {/* The PDF is genuinely white paper, so knock it back at night the
                way an e-reader does rather than firing a white slab at you.
                The marks sit outside the filter so they stay their own colour. */}
            <div
              ref={pagesRef}
              className="w-full dark:brightness-[0.82] dark:contrast-[0.96] dark:sepia-[0.12]"
            />
            <div className="pointer-events-none absolute inset-0">
              {marks.map((id) => {
                const box = boxes[id];
                const page = box && pages[box.page];
                if (!page) return null;

                return (
                  <div
                    key={id}
                    className="border-primary bg-primary/8 animate-in fade-in absolute rounded-[3px] border-2 duration-200"
                    style={{
                      left: box.x * page.scale - 3,
                      top: page.top + box.y * page.scale - 3,
                      width: box.width * page.scale + 6,
                      height: box.height * page.scale + 6,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid min-h-full place-items-center">
            <Thinking large label="Setting the type" className="flex-col gap-3" />
          </div>
        )}
      </div>
      {ingesting &&
        renderUrl && (
          // Tint the page down to a ghost of itself. Leaving it legible invites
          // you to read a document that's about to be replaced.
          <div className="bg-background/90 animate-in fade-in absolute inset-0 grid place-items-center backdrop-blur-md duration-200">
            <Thinking large label="Reading your resume" className="flex-col gap-3" />
          </div>
        )}
    </div>
  );
}
