"use client";

import { Redo2Icon, Undo2Icon } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePresence } from "@/hooks/use-presence";
import { useSwap } from "@/hooks/use-swap";
import { type Revision, useHistoryStore, useRevisions } from "@/lib/store/history";
import { cn } from "@/lib/utils";

/** Past this many, dots stop being countable at a glance and a number reads better. */
const MAX_DOTS = 14;
/** assistant-ui's exit beat: the quicker of its two. */
const EXIT_MS = 150;
/** The label's swap out, on the same beat, so a held key never outruns it. */
const SWAP_MS = 150;
/** Each dot's slot, and the width of the bar that marks the current one. */
const SLOT = 10;
const BAR = 12;
/**
 * How far a tip stands off its trigger to clear the top of the bar rather
 * than sit over it: from the label's top and the dots' top to the bar's edge,
 * plus the usual gap.
 */
const LABEL_CLEAR = 12;
const DOT_CLEAR = 24;

/** Whether focus is in something that takes typing. */
const editable = (target: EventTarget | null): target is HTMLElement =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

/**
 * Whether a key belongs to the field rather than the resume: only while there
 * is something typed in it to take back or move through. The chat's box has
 * focus from the moment the page opens, so leaving every focused field its
 * own keys meant they almost never reached the resume at all.
 */
const typing = (target: EventTarget | null) => {
  if (!editable(target)) return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.value.length > 0;
  }
  if (target.isContentEditable) return Boolean(target.textContent?.length);
  return true;
};

/**
 * Which way a key steps through history, if it does: ⌘Z / ⇧⌘Z / ⌘Y as
 * anywhere else, and bare ← → [ ] for walking through it. A bracket is a
 * character, so it is never taken from a field; an arrow only from one with
 * nothing in it to move through.
 */
function stepOf(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (event.metaKey || event.ctrlKey) {
    if (event.altKey || typing(event.target)) return 0;
    return key === "z" ? (event.shiftKey ? 1 : -1) : key === "y" ? 1 : 0;
  }
  if (event.altKey || event.shiftKey) return 0;
  if (key === "[" || key === "]") return editable(event.target) ? 0 : key === "]" ? 1 : -1;
  if (key === "arrowleft" || key === "arrowright") {
    return typing(event.target) ? 0 : key === "arrowright" ? 1 : -1;
  }
  return 0;
}

/**
 * The frosted surface the bar and its buttons share, so they read as one
 * piece. Frosted rather than solid: they float over the page, and the text
 * they cover should read as underneath, not cut in half.
 */
const SURFACE = "shadow-composer-focus bg-(--composer-bg)/85 backdrop-blur-md";

/**
 * As tall as the bar, so they cap it rather than orbit it, and as tall as the
 * header's buttons, so it reads as the same chrome. A step that isn't there
 * dims only its arrow: fading the whole button would let the page show
 * through the one disc that stays.
 */
const CIRCLE =
  "size-7 rounded-full disabled:opacity-100 disabled:[&_svg]:opacity-30 [&_svg]:transition-opacity [&_svg]:duration-200";

/**
 * Steps through every version of the resume this session, like flicking
 * through looks in a character creator: undo and redo either side, the
 * version's name between them, a dot for each to jump straight to. It floats
 * over the paper rather than living in the header because it is about the
 * page underneath, and only rises in once there is a step to take back.
 *
 * Moves the way the chat beside it does: in as one piece on assistant-ui's
 * message entrance, out on its quicker beat, everything inside on its curve.
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
      if (event.defaultPrevented || event.isComposing) return;
      const step = stepOf(event);
      if (!step) return;
      // Read at the keypress: the listener outlives any one render.
      const { at: now, revisions: all, go: to } = useHistoryStore.getState();
      if (!all[now + step]) return;
      event.preventDefault();
      to(now + step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!mounted) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
      <div
        role="group"
        aria-label="Resume history"
        className={cn(
          "pointer-events-auto flex items-center gap-1.5 font-sans",
          "animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none",
          closing &&
            "animate-out fade-out slide-out-to-bottom-1 fill-mode-forwards duration-150 motion-reduce:animate-none",
        )}
      >
        <TooltipIconButton
          tooltip="Undo · ← or ⌘Z"
          side="top"
          className={cn(SURFACE, CIRCLE)}
          disabled={at === 0}
          onClick={() => go(at - 1)}
        >
          <Undo2Icon className="size-3.5" />
        </TooltipIconButton>

        <div
          className={cn(
            SURFACE,
            "flex h-7 w-40 flex-col items-center justify-center gap-px rounded-full px-3.5",
          )}
        >
          <Label revisions={revisions} at={at} />
          {revisions.length > MAX_DOTS ? (
            <span className="text-muted-foreground text-[0.625rem] leading-2.5 tabular-nums">
              {at + 1} / {revisions.length}
            </span>
          ) : (
            <Dots revisions={revisions} at={at} go={go} />
          )}
        </div>

        <TooltipIconButton
          tooltip="Redo · → or ⇧⌘Z"
          side="top"
          className={cn(SURFACE, CIRCLE)}
          disabled={at === revisions.length - 1}
          onClick={() => go(at + 1)}
        >
          <Redo2Icon className="size-3.5" />
        </TooltipIconButton>
      </div>
    </div>
  );
}

/**
 * The version's name, swapped the way it was stepped: forward nudges left,
 * back nudges right — two pixels and a fade, like a reasoning block opening,
 * not a slide.
 */
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
              "text-foreground block max-w-full truncate text-[0.6875rem] leading-3 font-medium",
              "ease-aui transition-[opacity,translate] duration-150 motion-reduce:transition-none",
              "data-[phase=exit]:translate-x-[calc(var(--dir)*-0.125rem)] data-[phase=exit]:opacity-0",
              "data-[phase=enter]:translate-x-[calc(var(--dir)*0.125rem)] data-[phase=enter]:opacity-0 data-[phase=enter]:transition-none",
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
 * A dot per version and one bar that slides between them, so the eye follows
 * the step instead of hunting for which dot lit up.
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
        className="bg-foreground ease-aui pointer-events-none absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full transition-transform duration-200 motion-reduce:transition-none"
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
                className="group grid h-2 cursor-pointer place-items-center"
              />
            }
          >
            {/* Hover paints at once; only the way out eases. */}
            <span className="bg-foreground/25 group-hover:bg-foreground/60 block size-1 rounded-full transition-colors duration-150 group-hover:transition-none" />
          </TooltipTrigger>
          <RevisionTip revision={revision} clear={DOT_CLEAR} />
        </Tooltip>
      ))}
    </div>
  );
}
