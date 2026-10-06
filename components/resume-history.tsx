"use client";

import { MessageCirclePlusIcon, Redo2Icon, Undo2Icon } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { BrushTools } from "@/components/resume-brush";
import {
  TooltipGroup,
  type TooltipGroupHandle,
  TooltipTrigger,
  useTooltipGroup,
} from "@/components/ui/tooltip";
import { usePresence } from "@/hooks/use-presence";
import { useCommentsStore } from "@/lib/comments";
import { type Revision, useHistoryStore, useRevisions } from "@/lib/store/history";
import { takeOver } from "@/lib/store/replay";
import { cn } from "@/lib/utils";

/** Past this many, dots stop being countable at a glance and a number reads better. */
const MAX_DOTS = 14;
/** assistant-ui's exit beat: the quicker of its two. */
const EXIT_MS = 150;
/** How long a step's name stays up after a step taken without pointing at the bar. */
const FLASH_MS = 1200;
/** Each dot's slot, and the width of the bar that marks the current one. */
const SLOT = 10;
const BAR = 12;

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
 * The bar's surface: the composer's own, solid. Frosted, the page's text
 * showed through it and it read as a sticker on the paper rather than the
 * app's chrome.
 */
const SURFACE =
  "bg-(--composer-bg) shadow-[var(--composer-shadow-focus),0_8px_24px_-12px_rgb(0_0_0/0.18)]";

/**
 * As tall as the header's buttons, so it reads as the same chrome. A step
 * that isn't there dims only its arrow.
 */
const CIRCLE =
  "size-7 rounded-full disabled:opacity-100 disabled:[&_svg]:opacity-40 [&_svg]:transition-opacity [&_svg]:duration-200";

/**
 * The page's toolbar, floated at the bottom of the pane the way Figma's
 * sits under the canvas: the tools that work on the page — comment, pen,
 * highlighter — then, once there is a step to take back, the history, all in
 * one solid bar in the composer's chrome so it reads as part of the app
 * rather than something left on the paper.
 *
 * History steps through every version of the resume this session, like
 * flicking through looks in a character creator: undo and redo either side,
 * a dot for each to jump straight to, named in the bar's one gliding tip.
 *
 * Moves the way the chat beside it does: in as one piece on assistant-ui's
 * message entrance, out on its quicker beat, everything inside on its curve.
 */
export function ResumeHistory({ tools }: { tools: boolean }) {
  const live = useRevisions();
  const stepping = live.revisions.length > 1;
  const { mounted, closing } = usePresence(stepping, EXIT_MS);
  // While it sinks away the history may already be gone; keep showing the
  // last of it rather than an empty bar.
  const last = useRef(live);
  if (stepping) last.current = live;
  const { revisions, at } = last.current;
  // Stepping during a replay takes over from it, from where the session was left.
  const go = (to: number) => {
    takeOver();
    useHistoryStore.getState().go(to);
  };

  // One tip for the whole bar, gliding from button to dot to button. A step
  // taken from elsewhere — a key, undo, redo — opens it over the dot it landed
  // on for a moment, so a step always says where it went.
  const tips = useTooltipGroup();
  const ids = useId();
  const dot = (i: number) => `${ids}-step-${i}`;
  const seen = useRef(at);
  useEffect(() => {
    if (seen.current === at) return;
    seen.current = at;
    if (revisions.length > MAX_DOTS || tips.isOpen) return;
    tips.open(dot(at));
    const timer = window.setTimeout(() => tips.close(), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [at]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const step = stepOf(event);
      if (!step) return;
      takeOver();
      // Read at the keypress: the listener outlives any one render.
      const { at: now, revisions: all, go: to } = useHistoryStore.getState();
      if (!all[now + step]) return;
      event.preventDefault();
      to(now + step);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!tools && !mounted) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div
        role="group"
        aria-label="Page tools"
        className={cn(
          SURFACE,
          "pointer-events-auto flex h-9 items-center gap-0.5 rounded-full p-1 font-sans",
          "animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none",
        )}
      >
        {tools ? (
          <>
            <CommentTool group={tips} />
            <BrushTools group={tips} />
          </>
        ) : null}

        {mounted ? (
          <div
            role="group"
            aria-label="Resume history"
            className={cn(
              "flex items-center gap-0.5",
              "animate-in fade-in slide-in-from-left-1 duration-200 motion-reduce:animate-none",
              closing &&
                "animate-out fade-out slide-out-to-left-1 fill-mode-forwards duration-150 motion-reduce:animate-none",
            )}
          >
            {tools ? <span aria-hidden className="bg-border mx-1 h-4 w-px" /> : null}
            <TooltipIconButton
              tooltip="Undo · ← or ⌘Z"
              group={tips}
              className={CIRCLE}
              disabled={at === 0}
              onClick={() => go(at - 1)}
            >
              <Undo2Icon className="size-3.5" />
            </TooltipIconButton>

            <div className="flex h-7 items-center justify-center px-2">
              {revisions.length > MAX_DOTS ? (
                <TooltipTrigger
                  handle={tips}
                  payload={<StepTip revision={revisions[at]!} />}
                  render={
                    <span className="text-muted-foreground px-1 text-[0.6875rem] tabular-nums" />
                  }
                >
                  {at + 1} / {revisions.length}
                </TooltipTrigger>
              ) : (
                <Dots revisions={revisions} at={at} go={go} tips={tips} id={dot} />
              )}
              {/* What the tip says, for anyone not looking at it. */}
              <span aria-live="polite" className="sr-only">
                {revisions[at]?.label}
              </span>
            </div>

            <TooltipIconButton
              tooltip="Redo · → or ⇧⌘Z"
              group={tips}
              className={CIRCLE}
              disabled={at === revisions.length - 1}
              onClick={() => go(at + 1)}
            >
              <Redo2Icon className="size-3.5" />
            </TooltipIconButton>
          </div>
        ) : null}
      </div>
      <TooltipGroup handle={tips} />
    </div>
  );
}

/** C, as a button: arms the next click on the page to drop a pin. */
function CommentTool({ group }: { group: TooltipGroupHandle }) {
  const placing = useCommentsStore((s) => s.placing);
  return (
    <TooltipIconButton
      tooltip="Comment · C"
      group={group}
      aria-pressed={placing}
      onClick={() => useCommentsStore.getState().setPlacing(!placing)}
      className={cn(
        "size-7 rounded-full",
        placing && "bg-brand-leaf hover:bg-brand-leaf/90 text-white hover:text-white",
      )}
    >
      <MessageCirclePlusIcon className="size-3.5" />
    </TooltipIconButton>
  );
}

/** What a step was: what was asked, in their words, and what it changed. */
function StepTip({ revision }: { revision: Revision }) {
  const asked = revision.request && revision.label !== revision.changes[0];
  const changes =
    revision.changes.length > 1 || (revision.request && revision.changes.length)
      ? revision.changes.join(" · ")
      : "";
  return (
    <span className="flex flex-col gap-0.5 text-balance">
      <span className="line-clamp-2">{asked ? `“${revision.label}”` : revision.label}</span>
      {changes ? <span className="text-background/60">{changes}</span> : null}
    </span>
  );
}

/**
 * A dot per version and one bar that slides between them, so the eye follows
 * the step instead of hunting for which dot lit up. Each names its step in
 * the bar's tip.
 */
function Dots({
  revisions,
  at,
  go,
  tips,
  id,
}: {
  revisions: Revision[];
  at: number;
  go: (to: number) => void;
  tips: TooltipGroupHandle;
  id: (i: number) => string;
}) {
  return (
    <div className="relative flex items-center">
      <span
        aria-hidden
        className="bg-foreground/80 ease-aui pointer-events-none absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full transition-transform duration-200 motion-reduce:transition-none"
        style={{ width: BAR, transform: `translateX(${at * SLOT + (SLOT - BAR) / 2}px)` }}
      />
      {revisions.map((revision, i) => (
        <TooltipTrigger
          key={i}
          id={id(i)}
          handle={tips}
          payload={<StepTip revision={revision} />}
          render={
            <button
              type="button"
              aria-label={`Go to ${revision.label}`}
              aria-current={i === at ? "step" : undefined}
              onClick={() => go(i)}
              style={{ width: SLOT }}
              className="group grid h-7 cursor-pointer place-items-center outline-none"
            />
          }
        >
          {/* Hover paints at once; only the way out eases. */}
          <span className="bg-foreground/20 group-hover:bg-foreground/60 group-focus-visible:bg-foreground/60 block size-1 rounded-full transition-colors duration-150 group-hover:transition-none" />
        </TooltipTrigger>
      ))}
    </div>
  );
}
