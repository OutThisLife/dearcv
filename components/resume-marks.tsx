"use client";

import type { PageBox } from "@/hooks/use-pdf-pages";
import type { PdfBoxes } from "@/lib/resume/pdf-boxes";
import { useMarksStore } from "@/lib/store/marks";

/**
 * Outlines what the agent just touched. This is the one part of the pane that
 * has to follow the store as it changes — a mark appears and expires on its
 * own timer — so it subscribes, and it is small enough that redrawing it costs
 * nothing.
 *
 * Marks are ids resolved against the current layout on every paint, never
 * stored rectangles: the paper is redrawn on every edit, so coordinates held
 * from last time would point at a page that no longer exists.
 */
export function ResumeMarks({ boxes, pages }: { boxes: PdfBoxes; pages: PageBox[] }) {
  const marks = useMarksStore((s) => s.marks);

  return (
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
  );
}
