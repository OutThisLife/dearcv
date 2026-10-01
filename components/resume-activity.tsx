"use client";

import { MousePointer2Icon } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { PageBox } from "@/hooks/use-pdf-pages";
import { boxIds, type PdfBoxes } from "@/lib/resume/pdf-boxes";
import { HEAD, useActivityStore } from "@/lib/store/activity";
import { FLASH, type Mark, SCAN, useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";

/**
 * The agent at work on the page, after pen.dev's canvas, and only ever where
 * the model actually is: whatever a call's streaming arguments point at glows
 * from inside until it lands, what an edit touched flashes and is swept once
 * as it does, and while an upload is transcribed a reading head follows the
 * line the model has reached. A cursor travels to each of them.
 *
 * Everything is resolved by id against the current layout on every paint,
 * never held as rectangles: the paper is redrawn on every edit, so stored
 * coordinates would point at a page that no longer exists.
 */
export function ResumeActivity({
  boxes,
  drawnAt,
  pages,
}: {
  boxes: PdfBoxes;
  /** When the document these boxes describe arrived. */
  drawnAt: number;
  pages: PageBox[];
}) {
  // An edit's mark waits for the drawing with the edit in it; flashed any
  // earlier it would ring the old paper, then jump.
  const marks = useMarksStore((s) => s.marks).filter((mark) => mark.at <= drawnAt);
  const working = useActivityStore((s) => s.working);
  const targets = [...new Set(Object.values(working))];
  const head = useActivityStore((s) => s.head);
  const layout = useResumeStore((s) => s.layout);

  // A line of the uploaded page, from its own layout: where the model has
  // got to transcribing it. Only meaningful over their own file, which is
  // what is on screen until the first edit.
  const runRect = (index: number | null): Rect | undefined => {
    const run = index === null ? undefined : layout?.runs[index];
    // Layout pages count from 1, as the PDF numbers them.
    const page = run && pages[run.page - 1];
    if (!run || !page || !layout) return undefined;
    return {
      left: run.x * page.scale,
      top: page.top + (layout.height - run.y - run.size * 0.8) * page.scale,
      width: run.width * page.scale,
      height: run.size * page.scale,
    };
  };
  const reading = runRect(head);

  const rect = (id: string): Rect | undefined => {
    const box = boxes[id];
    const page = box && pages[box.page];
    if (!page) return undefined;
    return {
      left: box.x * page.scale,
      top: page.top + box.y * page.scale,
      width: box.width * page.scale,
      height: box.height * page.scale,
    };
  };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {reading ? <ReadingHead line={reading} width={pages[0]?.width ?? 0} /> : null}
      {targets.map((id) => {
        const at = id === boxIds.page ? undefined : rect(id);
        return at ? <Glow key={id} rect={at} /> : null;
      })}
      {marks.map((mark) => {
        if (mark.id === boxIds.page) {
          return pages.map((page, i) => (
            <Flash
              key={`${mark.id}-${mark.at}-${i}`}
              mark={mark}
              rect={{ left: 0, ...page }}
              inset
            />
          ));
        }
        const at = rect(mark.id);
        return at ? <Flash key={`${mark.id}-${mark.at}`} mark={mark} rect={at} /> : null;
      })}
      <Cursor
        // Like a mark, it heads for an edit once the edit is on the paper. What
        // is being worked on hasn't changed yet, so that is already there.
        resolve={(target, at) => {
          if (target === HEAD) return reading;
          if (at > drawnAt && !targets.includes(target)) return undefined;
          return target === boxIds.page ? pages[0] && { left: 0, ...pages[0] } : rect(target);
        }}
        busy={targets.length > 0}
      />
    </div>
  );
}

type Rect = { left: number; top: number; width: number; height: number };

const place = ({ left, top, width, height }: Rect, out: number): CSSProperties => ({
  left: left - out,
  top: top - out,
  width: width + out * 2,
  height: height + out * 2,
});

/**
 * Something being worked on: a ring, and inside it two soft lights circling
 * each other, multiplied into the paper so the type over them stays black.
 */
function Glow({ rect }: { rect: Rect }) {
  // Each starts at its own point in the orbit, so two at once don't move in lockstep.
  const [phase] = useState(() => Math.random());
  const size = Math.max(rect.width, rect.height);

  return (
    <div
      className="activity-ring animate-in fade-in absolute duration-300"
      // Tight to the box: sections sit close, and a wider ring cuts through
      // the line above.
      style={{ ...place(rect, 3), borderRadius: 5 }}
    >
      <div
        className="activity-orbit absolute top-1/2 left-1/2"
        style={
          {
            width: size,
            height: size,
            "--orbit-blur": `${size * 0.2}px`,
            animationDelay: `${-phase * 12.6}s`,
          } as CSSProperties
        }
      >
        <span className="activity-light" style={{ left: 0 }} />
        <span className="activity-light" style={{ left: "100%" }} />
      </div>
    </div>
  );
}

/**
 * The line the model has reached in the upload, as it transcribes it: a soft
 * band trailing down to an edge under that line, moving only when the model
 * does. It glides to each new line rather than jumping, and stops when the
 * model is slow — it is a position, not an animation.
 */
function ReadingHead({ line, width }: { line: Rect; width: number }) {
  const trail = line.height * 3;
  // Never scrolled to. They are looking at their own resume as it is read,
  // and pulling the pane down to page two the moment the model got there
  // took the page out from under them.
  return (
    <div
      className="activity-head absolute top-0 left-0"
      style={{
        width,
        height: trail,
        transform: `translateY(${line.top + line.height + 3 - trail}px)`,
      }}
    />
  );
}

/**
 * An edit landing, on pen's envelope: the ring snaps in from wide, holds while
 * a scan passes down through what changed, then lets go.
 */
function Flash({ mark, rect, inset }: { mark: Mark; rect: Rect; inset?: boolean }) {
  // A beat of jitter, as pen has, so a handful of marks don't fire as one block.
  const [delay] = useState(() => Math.random() * 50);
  const small = Math.min(rect.width, rect.height) < 20;

  // Done when its envelope is, timed rather than heard from the animation so
  // reduced motion, which plays none, still lets it go.
  useEffect(() => {
    const timer = window.setTimeout(
      () => useMarksStore.getState().unmark(mark),
      delay + FLASH.attackMs + FLASH.holdMs + FLASH.releaseMs,
    );
    return () => window.clearTimeout(timer);
  }, [mark, delay]);

  return (
    <div
      className="activity-flash absolute"
      style={
        {
          // The ring and the scan share this edge: the box with pen's 5px of
          // air, the scan clipped to it and the ring drawn on it.
          ...place(rect, inset ? 0 : 5),
          "--flash-ms": `${FLASH.attackMs + FLASH.holdMs + FLASH.releaseMs}ms`,
          "--flash-radius": small || inset ? "0px" : "3px",
          // A page fills the pane edge to edge, so its ring closes in from inside it.
          "--flash-shift": inset ? "-8px" : "0px",
          animationDelay: `${delay}ms`,
        } as CSSProperties
      }
    >
      {/* One pass, then gone: the keyframes spend half their run parked
          below the box, so the sweep itself is SCAN.sweepMs. */}
      <div
        className="activity-scan"
        style={
          {
            "--scan-ms": `${SCAN.sweepMs * 2}ms`,
            animationDelay: `${delay + SCAN.delayMs}ms`,
            animationIterationCount: 1,
            animationFillMode: "both",
          } as CSSProperties
        }
      />
    </div>
  );
}

/** How long the cursor lingers after the last thing it was sent to, and how long it takes to fade. */
const IDLE_MS = 5000;

/**
 * The agent's cursor. It goes to a loose point inside whatever it was last
 * sent to — two dice, so it favours the middle of its range without sitting
 * dead centre —
 * drifts a little while it waits there, and fades once nothing has needed it
 * for a while. It appears where it is needed rather than flying in from
 * wherever it last was.
 */
function Cursor({
  resolve,
  busy,
}: {
  resolve: (target: string, at: number) => Rect | undefined;
  busy: boolean;
}) {
  const cursor = useActivityStore((s) => s.cursor);
  const [idle, setIdle] = useState(true);
  const spot = useRef<{ at: number; x: number; y: number } | null>(null);
  const wasHidden = useRef(true);

  useEffect(() => {
    if (!cursor) return;
    setIdle(false);
    if (busy) return;
    const timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [cursor, busy]);

  const rect = cursor ? resolve(cursor.target, cursor.at) : undefined;
  if (cursor && rect && spot.current?.at !== cursor.at) {
    const loose = () => (Math.random() + Math.random()) / 2;
    // Over a whole page it keeps below the name, where the reading pill is;
    // over a part of it, toward the ragged right where lines tend to end.
    const page = cursor.target === boxIds.page;
    const top = page ? 180 : 0;
    spot.current =
      cursor.target === HEAD
        ? // Following the transcription it rides the end of the line, like a caret.
          { at: cursor.at, x: rect.left + rect.width + 2, y: rect.top + rect.height * 0.4 }
        : {
            at: cursor.at,
            x: rect.left + rect.width * (page ? loose() : 0.55 + 0.4 * loose()),
            y:
              rect.top + top + Math.max(0, Math.min(rect.height, page ? 900 : 240) - top) * loose(),
          };
  }

  const visible = !idle && spot.current !== null;
  // Arriving from hidden it is placed, not flown: no transition on that frame.
  const jump = visible && wasHidden.current;
  useEffect(() => {
    wasHidden.current = !visible;
  });

  if (!spot.current) return null;

  return (
    <div
      className="activity-cursor absolute top-0 left-0"
      data-visible={visible || undefined}
      data-jump={jump || undefined}
      style={{ transform: `translate(${spot.current.x}px, ${spot.current.y}px)` }}
    >
      <div className="activity-cursor-drift">
        <MousePointer2Icon
          className="fill-brand-leaf size-5.5 -translate-x-1 -translate-y-1 stroke-white stroke-[1.5] drop-shadow-[0_1px_2px_rgb(0_0_0/0.25)]"
          aria-hidden
        />
        <span className="bg-brand-leaf absolute top-[1.125rem] left-3.5 rounded-[2px] px-[5px] py-[2px] font-sans text-[0.6875rem] leading-none font-medium whitespace-nowrap text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]">
          DearCV
        </span>
      </div>
    </div>
  );
}
