"use client";

import { Redo2Icon, Undo2Icon } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePresence } from "@/hooks/use-presence";
import { useSwap } from "@/hooks/use-swap";
import { type Revision, useHistoryStore, useRevisions } from "@/lib/store/history";
import { cn } from "@/lib/utils";

/** Past this many, dots stop being countable at a glance and a number reads better. */
const MAX_DOTS = 14;
/** transitions.dev's toast clock: in on the slower beat, out on the quicker. */
const EXIT_MS = 250;
/** Its text swap: long enough to read as a change, short enough to keep up with ⌘Z held down. */
const SWAP_MS = 120;
/** Each dot's slot, and the width of the bar that marks the current one. */
const SLOT = 12;
const BAR = 14;
/**
 * How far a tip stands off its trigger to clear the top of the bar rather
 * than sit over it: from the label's top and the dots' top to the bar's edge,
 * plus the usual gap.
 */
const LABEL_CLEAR = 15;
const DOT_CLEAR = 33;

/**
 * Whether ⌘Z belongs to the field rather than the resume: only while there
 * is something typed in it to take back. The chat's box has focus from the
 * moment the page opens, so leaving every focused field its own ⌘Z meant
 * undo almost never reached the resume at all.
 */
const typing = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.value.length > 0;
  }
  if (target.isContentEditable) return Boolean(target.textContent?.length);
  return target.tagName === "SELECT";
};

/**
 * The frosted surface the bar and its buttons share, so they read as one
 * piece. Frosted rather than solid: they float over the page, and the text
 * they cover should read as underneath, not cut in half.
 */
const SURFACE = "shadow-composer-focus bg-(--composer-bg)/85 backdrop-blur-md";

/**
 * As tall as the bar, so they cap it rather than orbit it. A step that isn't
 * there dims only its arrow: fading the whole button would let the page show
 * through the one disc that stays.
 */
const CIRCLE =
  "size-11 rounded-full disabled:opacity-100 disabled:[&_svg]:opacity-30 [&_svg]:transition-opacity";

/**
 * Steps through every version of the resume this session, like flicking
 * through looks in a character creator: undo and redo either side, the
 * version's name between them, a dot for each to jump straight to. It floats
 * over the paper rather than living in the header because it is about the
 * page underneath, and only rises in once there is a step to take back.
 */
export function ResumeHistory() {
  const live = useRevisions();
  const { mounted, closing } = usePresence(live.revisions.length > 1, EXIT_MS);
  // While it sinks away the history may already be gone; keep showing the
  // last of it rather than an empty bar.
  const last = useRef(live);
  if (live.revisions.length > 1) last.current = live;
  const { revisions, at } = last.current;
  const { go } = useHistoryStore.getState();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || typing(event.target)) return;
      const key = event.key.toLowerCase();
      const step = key === "z" ? (event.shiftKey ? 1 : -1) : key === "y" ? 1 : 0;
      if (!step) return;
      // Read at the keypress: the listener outlives any one render.
      const { at: now, revisions: all } = useHistoryStore.getState();
      if (!all[now + step]) return;
      event.preventDefault();
      go(now + step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!mounted) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
      <div
        role="group"
        aria-label="Resume history"
        className="pointer-events-auto flex items-center gap-2 font-sans"
      >
        <Side side="start" closing={closing}>
          <TooltipIconButton
            tooltip="Undo · ⌘Z"
            side="top"
            className={cn(SURFACE, CIRCLE)}
            disabled={at === 0}
            onClick={() => go(at - 1)}
          >
            <Undo2Icon className="size-4" />
          </TooltipIconButton>
        </Side>

        <div
          className={cn(
            SURFACE,
            "flex h-11 w-48 flex-col items-center justify-center gap-0.5 rounded-full px-4",
            // transitions.dev's toast: rises, sharpens and grows the last 3% into place.
            "ease-smooth-out transition-[opacity,translate,scale,filter] duration-350 motion-reduce:transition-none",
            "starting:translate-y-4 starting:scale-97 starting:opacity-0 starting:blur-[2px]",
            closing && "translate-y-4 scale-97 opacity-0 blur-[2px] duration-250",
          )}
        >
          <Label revisions={revisions} at={at} />
          {revisions.length > MAX_DOTS ? (
            <span className="text-muted-foreground text-[0.6875rem] leading-3 tabular-nums">
              {at + 1} / {revisions.length}
            </span>
          ) : (
            <Dots revisions={revisions} at={at} go={go} />
          )}
        </div>

        <Side side="end" closing={closing}>
          <TooltipIconButton
            tooltip="Redo · ⇧⌘Z"
            side="top"
            className={cn(SURFACE, CIRCLE)}
            disabled={at === revisions.length - 1}
            onClick={() => go(at + 1)}
          >
            <Redo2Icon className="size-4" />
          </TooltipIconButton>
        </Side>
      </div>
    </div>
  );
}

/**
 * Undo and redo slide out from behind the bar once it has landed, and tuck
 * back behind it on the way out, so the three arrive as one thing opening up
 * rather than three things appearing.
 */
function Side({
  side,
  closing,
  children,
}: {
  side: "start" | "end";
  closing: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "ease-smooth-out transition-[opacity,translate,scale,filter] delay-75 duration-350 motion-reduce:transition-none",
        "starting:scale-60 starting:opacity-0 starting:blur-xs",
        side === "start" ? "starting:translate-x-6" : "starting:-translate-x-6",
        closing && "scale-60 opacity-0 blur-xs delay-0 duration-200",
        closing && (side === "start" ? "translate-x-6" : "-translate-x-6"),
      )}
    >
      {children}
    </div>
  );
}

/** The version's name, swapped the way it was stepped: forward slides left, back slides right. */
function Label({ revisions, at }: { revisions: Revision[]; at: number }) {
  const { shown, phase } = useSwap(at, SWAP_MS);
  const from = useRef(at);
  const direction = useRef(1);
  if (from.current !== at) {
    direction.current = at > from.current ? 1 : -1;
    from.current = at;
  }

  const revision = revisions[shown] ?? revisions[at];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-live="polite"
            data-phase={phase}
            style={{ "--dir": direction.current } as CSSProperties}
            className={cn(
              "text-foreground block max-w-full truncate text-xs leading-4 font-medium",
              "transition-[opacity,translate,filter] duration-120 ease-in-out motion-reduce:transition-none",
              "data-[phase=exit]:translate-x-[calc(var(--dir)*-0.375rem)] data-[phase=exit]:opacity-0 data-[phase=exit]:blur-xs",
              "data-[phase=enter]:translate-x-[calc(var(--dir)*0.375rem)] data-[phase=enter]:opacity-0 data-[phase=enter]:blur-xs data-[phase=enter]:transition-none",
            )}
          />
        }
      >
        {revision?.label}
      </TooltipTrigger>
      {revision ? <RevisionTip revision={revision} clear={LABEL_CLEAR} /> : null}
    </Tooltip>
  );
}

/**
 * The whole of a step, for when its name is cut short or it is only a dot:
 * what was asked, in their words, and what it changed.
 */
function RevisionTip({ revision, clear }: { revision: Revision; clear: number }) {
  return (
    <TooltipContent side="top" sideOffset={clear} className="max-w-64 flex-col items-start gap-0.5">
      <span className="line-clamp-3">
        {revision.request && revision.label !== revision.changes[0]
          ? `“${revision.label}”`
          : revision.label}
      </span>
      {revision.changes.length > 1 || (revision.request && revision.changes.length) ? (
        <span className="text-background/60">{revision.changes.join(" · ")}</span>
      ) : null}
    </TooltipContent>
  );
}

/**
 * A dot per version and one bar that slides between them (transitions.dev's
 * sliding tab pill), so the eye follows the step instead of hunting for which
 * dot lit up.
 */
function Dots({
  revisions,
  at,
  go,
}: {
  revisions: Revision[];
  at: number;
  go: (to: number) => void;
}) {
  return (
    <div className="relative flex items-center">
      <span
        aria-hidden
        className="bg-foreground ease-smooth-out pointer-events-none absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full transition-transform duration-250 motion-reduce:transition-none"
        style={{ width: BAR, transform: `translateX(${at * SLOT + (SLOT - BAR) / 2}px)` }}
      />
      {revisions.map((revision, i) => (
        <Tooltip key={i}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Go to ${revision.label}`}
                aria-current={i === at ? "step" : undefined}
                onClick={() => go(i)}
                style={{ width: SLOT }}
                className="group grid h-3 cursor-pointer place-items-center"
              />
            }
          >
            {/* Hover lands at once and lets go slowly, so skimming the row never lags the pointer. */}
            <span className="bg-foreground/25 group-hover:bg-foreground/60 block size-1.5 rounded-full transition-colors duration-200 group-hover:duration-0" />
          </TooltipTrigger>
          <RevisionTip revision={revision} clear={DOT_CLEAR} />
        </Tooltip>
      ))}
    </div>
  );
}
