"use client";

import { usePdfPages } from "@/hooks/use-pdf-pages";
import { usePdfRender } from "@/hooks/use-pdf-render";
import { PdfFileIcon } from "@/components/pdf-file-icon";
import { ResumeHistory } from "@/components/resume-history";
import { ResumeActivity } from "@/components/resume-activity";
import { BrushBar, ResumeBrush } from "@/components/resume-brush";
import { ResumeComments } from "@/components/resume-comments";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Thinking } from "@/components/ui/thinking";
import { pickPdf, useReading } from "@/lib/resume/ingest";
import { isEmptyResume } from "@/lib/resume/schema";
import { useRevisions } from "@/lib/store/history";
import { useReplayStore } from "@/lib/store/replay";
import { useResumeStore } from "@/lib/store/resume";
import { cn } from "@/lib/utils";

export function ResumePreview() {
  const doc = useResumeStore((s) => s.doc);
  const touched = useResumeStore((s) => s.touched);
  const originalUrl = useResumeStore((s) => s.originalUrl);
  const previewUrl = useResumeStore((s) => s.previewUrl);
  const ingesting = useResumeStore((s) => s.ingesting);
  const reading = useReading();
  const replay = useReplayStore((s) => s.active);

  const { boxes, drawnAt, failed } = usePdfRender(doc);

  // Their actual file, for as long as it is still what the document says. The
  // background transcription fills the document without flipping `touched`, so
  // uploading alone never swaps the real PDF for our redraw — only an edit does.
  const renderUrl = originalUrl && !touched ? originalUrl : previewUrl;

  const { hostRef, pages } = usePdfPages(renderUrl);
  const stepping = useRevisions().revisions.length > 1;

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
          // Room under the last page for the history bar to float in, so it
          // never has to sit over the end of the resume.
          <div className={cn("relative min-h-full w-full", stepping && "pb-20")}>
            {/* The PDF is genuinely white paper, so knock it back at night the
                way an e-reader does rather than firing a white slab at you.
                The agent's marks sit outside the filter so they stay their own colour. */}
            <div
              ref={hostRef}
              className="w-full dark:brightness-[0.82] dark:contrast-[0.96] dark:sepia-[0.12]"
            />
            <ResumeActivity boxes={boxes} drawnAt={drawnAt} pages={pages} />
            <ResumeComments boxes={boxes} pages={pages} />
            <ResumeBrush pages={pages} />
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
      {replay ? (
        <Notice>
          <span className="text-muted-foreground font-sans text-xs">
            Replaying the session · Esc to skip
          </span>
        </Notice>
      ) : reading && renderUrl ? (
        // The page itself shows the reading — the line it has reached — so
        // this only has to say what that is, out of the way at the top.
        <Notice>
          <Thinking label="Reading your resume" />
        </Notice>
      ) : null}
      {renderUrl && !empty && !replay ? <BrushBar /> : null}
      <ResumeHistory />
    </div>
  );
}

/** A word about what the pane is doing, floated at its top. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center">
      {/* A flex row, not a line of text: inline, it sat on the page's 24px
          line and the spinner rode low. The braille glyph carries its own
          left bearing, so the left side takes less. */}
      <div className="shadow-composer-focus animate-in fade-in slide-in-from-top-1 flex h-8 items-center rounded-full bg-(--composer-bg)/85 pr-3 pl-2.5 backdrop-blur-md duration-200 motion-reduce:animate-none">
        {children}
      </div>
    </div>
  );
}
