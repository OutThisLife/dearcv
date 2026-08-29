"use client";

import { useEffect, useRef, useState } from "react";

/** Where a painted page sits in the scroller, and its PDF-point-to-pixel scale. */
export type PageBox = { top: number; scale: number };

/** Below this the pane is mid-layout and not worth painting into. */
const MIN_WIDTH_REM = 0.5;

/** A resize smaller than this is a scrollbar or a rounding error. */
const IGNORE_RESIZE_REM = 0.125;

const SETTLE_MS = 80;

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

/**
 * Paints a PDF into a host element, one canvas per page, and reports where
 * each page landed so anything drawn over the top can find it.
 */
export function usePdfPages(url: string | null) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const [pages, setPages] = useState<PageBox[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!url || !host) return;

    let cancelled = false;
    let timer = 0;

    const paint = async () => {
      const width = host.clientWidth;
      if (width < rem() * MIN_WIDTH_REM) return;
      widthRef.current = width;

      const { getDocumentProxy } = await import("unpdf");
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      if (cancelled) return;

      const pdf = await getDocumentProxy(bytes);
      if (cancelled) {
        await pdf.cleanup();
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const points: number[] = [];
      // Painted off-document and swapped in at the end. Clearing the host up
      // front emptied the pane on every keystroke-sized edit and let the pages
      // pop back one at a time, which is what made an edit feel like a reload.
      const painted: HTMLCanvasElement[] = [];

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
        painted.push(canvas);
      }

      await pdf.cleanup();
      if (cancelled) return;

      host.replaceChildren(...painted);

      // Measure the painted canvases rather than adding up heights, so the
      // marks cannot drift a subpixel per page down a long resume.
      setPages(
        Array.from(host.children).map((child, i) => {
          const canvas = child as HTMLCanvasElement;
          return { top: canvas.offsetTop, scale: canvas.clientWidth / points[i] };
        }),
      );
    };

    // A quick second edit revokes the blob this pass is still fetching. That
    // is expected — a newer paint is already on its way — but unhandled it
    // rejected and left whatever was on screen standing as the current resume.
    const repaint = () =>
      void paint().catch((error) => {
        if (!cancelled) console.error("Couldn't paint the resume.", error);
      });

    repaint();

    const observer = new ResizeObserver(() => {
      if (Math.abs(host.clientWidth - widthRef.current) < rem() * IGNORE_RESIZE_REM) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(repaint, SETTLE_MS);
    });
    observer.observe(host);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [url]);

  return { hostRef, pages };
}
