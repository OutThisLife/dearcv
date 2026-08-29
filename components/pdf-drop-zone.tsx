"use client";

import { useEffect, useState } from "react";
import { ingestPdf } from "@/lib/resume/ingest";

const draggingFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === "file");

export function PdfDropZone({ children }: { children: React.ReactNode }) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    // dragenter/dragleave fire per element, so count them to know when the
    // pointer has actually left the window.
    let depth = 0;

    const onEnter = (event: DragEvent) => {
      if (!draggingFiles(event)) return;
      depth += 1;
      setOver(true);
    };

    const onOver = (event: DragEvent) => {
      if (!draggingFiles(event)) return;
      event.preventDefault();
    };

    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!draggingFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      const file = event.dataTransfer?.files[0];
      if (file) void ingestPdf(file);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <>
      {children}
      {over ? (
        <div className="bg-background/80 pointer-events-none fixed inset-0 z-50 grid place-items-center backdrop-blur-[0.125rem]">
          <div className="text-center">
            <div className="text-sm font-medium">Let go and I&rsquo;ll take it</div>
            <div className="text-muted-foreground mt-1 text-xs">PDFs only</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
