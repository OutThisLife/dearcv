"use client";

import { usePdfPages } from "@/hooks/use-pdf-pages";
import { usePdfRender } from "@/hooks/use-pdf-render";
import { PdfFileIcon } from "@/components/pdf-file-icon";
import { ResumeMarks } from "@/components/resume-marks";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Thinking } from "@/components/ui/thinking";
import { pickPdf } from "@/lib/resume/ingest";
import { isEmptyResume } from "@/lib/resume/schema";
import { useResumeStore } from "@/lib/store/resume";
import { cn } from "@/lib/utils";

export function ResumePreview() {
  const doc = useResumeStore((s) => s.doc);
  const touched = useResumeStore((s) => s.touched);
  const originalUrl = useResumeStore((s) => s.originalUrl);
  const previewUrl = useResumeStore((s) => s.previewUrl);
  const ingesting = useResumeStore((s) => s.ingesting);

  const { boxes, failed } = usePdfRender(doc);

  // Their actual file, for as long as it is still what the document says. The
  // background transcription fills the document without flipping `touched`, so
  // uploading alone never swaps the real PDF for our redraw — only an edit does.
  const renderUrl = originalUrl && !touched ? originalUrl : previewUrl;

  const { hostRef, pages } = usePdfPages(renderUrl);

  // Nothing to show and nothing coming. Reading this off renderUrl alone put
  // the whole drop zone back on screen while the first edit was still being
  // drawn, at the exact moment the agent said it had changed something.
  const empty = isEmptyResume(doc) && !originalUrl && !ingesting;

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
              ref={hostRef}
              className="w-full dark:brightness-[0.82] dark:contrast-[0.96] dark:sepia-[0.12]"
            />
            <ResumeMarks boxes={boxes} pages={pages} />
          </div>
        ) : failed ? (
          <EmptyState
            className="min-h-full"
            icon={<PdfFileIcon />}
            description="Something went wrong drawing your resume. Ask for the change again and I'll have another go."
          />
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
