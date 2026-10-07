"use client";

import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { ArrowUpIcon, CheckIcon, Redo2Icon, Trash2Icon, Undo2Icon } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { PageBox } from "@/hooks/use-pdf-pages";
import { TextMessagePartProvider } from "@assistant-ui/react";
import { MarkdownText } from "@/components/assistant-ui/elements/markdown-text";
import { CallNote } from "@/components/resume-tools";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { TooltipGroup, useTooltipGroup } from "@/components/ui/tooltip";
import { GlyphSpinner } from "@/components/ui/glyph-spinner";
import { Thinking } from "@/components/ui/thinking";
import {
  type Comment,
  type Draft,
  commentsOf,
  hasChanges,
  isAsking,
  isRunning,
  placeOf,
  progressOf,
  reply,
  setUndone,
  shortAgo,
  showChanges,
  submitDraft,
  useCommentsStore,
} from "@/lib/comments";
import { WORDMARK_LEAF_PATH } from "@/lib/dearcv-artwork";
import { useReading } from "@/lib/resume/ingest";
import type { PdfBoxes } from "@/lib/resume/pdf-boxes";
import { locatePin } from "@/lib/resume/pin-context";
import { useDocumentKey } from "@/lib/store/history";
import { useResumeStore } from "@/lib/store/resume";
import { cn } from "@/lib/utils";

/** The thread card's width, and the gap it keeps from its pin. */
const CARD_PX = 320;
const CARD_GAP = 14;
/** How big a pin is: it points from its bottom-left corner, like Figma's. */
const PIN_PX = 28;
/** A card's first row — the reply line of a new comment, a thread's header — centred on the pin. */
const ROW_PX = 36;

type Spot = { x: number; y: number };

/**
 * Comments on the page. C arms the next click to drop a pin; the pin asks for words, and once it has them its agent
 * gets to work — on the page, where the pin's number turns into a spinner,
 * and in the pin's thread, where it replies or asks.
 *
 * Pins hold to the part of the resume they were dropped on, by id and by
 * where in it, so an edit that moves that part takes the pin along. One
 * whose part is gone stays where it was put.
 */
export function ResumeComments({ boxes, pages }: { boxes: PdfBoxes; pages: PageBox[] }) {
  const owner = useDocumentKey();
  const all = useCommentsStore((s) => s.comments);
  const placing = useCommentsStore((s) => s.placing);
  const draft = useCommentsStore((s) => s.draft);
  const open = useCommentsStore((s) => s.open);
  const comments = commentsOf(all, owner).filter((one) => !one.resolved);

  const spotOf = (comment: Draft): Spot | undefined => {
    const box = comment.anchor && boxes[comment.anchor.box];
    const onBox = box && pages[box.page];
    if (box && onBox && comment.anchor) {
      return {
        x: (box.x + comment.anchor.fx * box.width) * onBox.scale,
        y: onBox.top + (box.y + comment.anchor.fy * box.height) * onBox.scale,
      };
    }
    const page = pages[comment.pin.page];
    return page && { x: comment.pin.x * page.scale, y: page.top + comment.pin.y * page.scale };
  };

  useHotkeys();

  const width = pages[0]?.width ?? 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {placing ? (
        <div
          className="comment-cursor pointer-events-auto absolute inset-0"
          onClick={(event) => {
            const host = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - host.left;
            const y = event.clientY - host.top;
            const index = pages.findIndex((page) => y >= page.top && y <= page.top + page.height);
            const page = pages[index];
            if (!page) return;
            const pin = { page: index, x: x / page.scale, y: (y - page.top) / page.scale };
            const { doc } = useResumeStore.getState();
            useCommentsStore.getState().place({ pin, ...locatePin(pin, page.lines, boxes, doc) });
          }}
        />
      ) : null}

      {comments.map((comment) => {
        const spot = spotOf(comment);
        if (!spot) return null;
        return (
          <div key={comment.id}>
            <CommentPin comment={comment} spot={spot} open={open === comment.id} />
            {open === comment.id ? (
              <Card spot={spot} width={width}>
                <Thread comment={comment} />
              </Card>
            ) : null}
          </div>
        );
      })}

      {draft
        ? (() => {
            const spot = spotOf(draft);
            return spot ? (
              <>
                <PinShape spot={spot} className="bg-brand-leaf text-white">
                  <span className="size-1.5 rounded-full bg-white" />
                </PinShape>
                <Card spot={spot} width={width}>
                  <Reply
                    autoFocus
                    placeholder="Add a comment"
                    onSend={submitDraft}
                    onCancel={() => useCommentsStore.getState().cancelDraft()}
                  />
                </Card>
              </>
            ) : null;
          })()
        : null}
    </div>
  );
}

/**
 * C arms a pin, Escape backs out of whatever is open, a click away from a
 * thread closes it. None of it while typing: C is a letter first.
 */
function useHotkeys() {
  useEffect(() => {
    const editable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

    const onKey = (event: globalThis.KeyboardEvent) => {
      const store = useCommentsStore.getState();
      if (event.key === "Escape") {
        if (store.draft) store.cancelDraft();
        else if (store.placing) store.setPlacing(false);
        else if (store.open) store.setOpen(null);
        return;
      }
      if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (editable(event.target)) return;
      event.preventDefault();
      store.setPlacing(!store.placing);
    };

    const onDown = (event: PointerEvent) => {
      const store = useCommentsStore.getState();
      if (!store.open && !store.draft) return;
      if (event.target instanceof Element && event.target.closest("[data-comment]")) return;
      if (store.draft) store.cancelDraft();
      else store.setOpen(null);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);
}

function PinShape({
  spot,
  className,
  children,
  ...rest
}: { spot: Spot } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      data-comment
      {...rest}
      className={cn(
        "pointer-events-auto absolute grid place-items-center rounded-full rounded-bl-none font-sans text-xs font-medium tabular-nums",
        "shadow-[0_0_0_2px_white,0_2px_6px_rgb(0_0_0/0.25)] transition-[scale,background-color,box-shadow] duration-150 ease-aui hover:scale-110",
        "animate-in fade-in zoom-in-50 origin-bottom-left duration-200 ease-aui motion-reduce:animate-none",
        className,
      )}
      style={{ left: spot.x, top: spot.y - PIN_PX, width: PIN_PX, height: PIN_PX }}
    >
      {children}
    </button>
  );
}

/**
 * A pin says what its agent is doing without being opened: its number at
 * rest, a spinner while it works, and a soft halo of its own pink when it
 * has asked something and is waiting on an answer. Pink in either theme:
 * the page stays paper at night.
 */
function CommentPin({ comment, spot, open }: { comment: Comment; spot: Spot; open: boolean }) {
  const waiting = isAsking(comment);
  const pointedAt = useCommentsStore((s) => s.hover === comment.id);
  return (
    <PinShape
      spot={spot}
      data-comment-pin={comment.id}
      aria-label={`Comment ${comment.n}`}
      aria-expanded={open}
      onClick={() => useCommentsStore.getState().setOpen(open ? null : comment.id)}
      className={cn(
        "bg-brand-leaf text-white",
        (open || pointedAt) && "scale-110",
        // Waiting on them: a soft halo of its own pink around the white edge.
        waiting &&
          "shadow-[0_0_0_2px_white,0_0_0_6px_color-mix(in_oklab,var(--brand-leaf)_30%,transparent),0_2px_6px_rgb(0_0_0/0.25)]",
      )}
    >
      {isRunning(comment) ? <GlyphSpinner className="text-[11px]" /> : comment.n}
    </PinShape>
  );
}

/** Beside its pin, flipped to the left when the right would run off the page. */
function Card({ spot, width, children }: { spot: Spot; width: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const right = spot.x + PIN_PX + CARD_GAP;
  const left = right + CARD_PX > width - 8 ? Math.max(8, spot.x - CARD_PX - CARD_GAP) : right;

  // Opened low on the screen, its reply box would sit below the fold: bring
  // it up, the least it takes, and leave the page alone when it already fits.
  // The reply grows it after that, so it keeps itself in view as it grows.
  useEffect(() => {
    const card = ref.current;
    if (!card) return;
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    let height = card.offsetHeight;
    const grown = new ResizeObserver(() => {
      if (card.offsetHeight <= height) return;
      height = card.offsetHeight;
      card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    grown.observe(card);
    return () => grown.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-comment
      // The chat's own surface, in the chat's beige, so a thread reads as a
      // piece of the conversation set down on the page.
      className="animate-in fade-in slide-in-from-left-1 bg-sidebar pointer-events-auto absolute shadow-[var(--composer-shadow-focus),0_12px_32px_-12px_rgb(0_0_0/0.22)] scroll-my-20 overflow-hidden rounded-xl font-sans duration-200 motion-reduce:animate-none"
      style={{ left, top: spot.y - PIN_PX / 2 - ROW_PX / 2, width: CARD_PX }}
    >
      {children}
    </div>
  );
}

/**
 * A thread the way Figma lays one out: what it is on and its actions along
 * the top, then each message under a small face, a name and when — theirs
 * and DearCV's alike, so it reads as a conversation rather than a log — and
 * one slim line to reply in at the bottom.
 */
function Thread({ comment }: { comment: Comment }) {
  const scroller = useRef<HTMLDivElement>(null);
  const { resolve, remove } = useCommentsStore.getState();

  // Stay with the newest words as they stream in.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [comment.messages]);

  // Opening it shows what it changed, wherever that landed.
  useEffect(() => {
    if (!isRunning(comment)) showChanges(comment.id);
  }, []);

  const tips = useTooltipGroup();
  const reading = useReading();
  const busy = isRunning(comment);
  const place = placeOf(comment);
  const changed = !busy && !comment.error && hasChanges(comment.id);
  const lastReply = comment.messages.findLastIndex((message) => message.role === "assistant");

  return (
    <>
      <div className="flex h-9 items-center justify-between gap-2 pr-1 pl-3">
        <span className="text-muted-foreground min-w-0 truncate text-xs">
          {place ? `On “${place}”` : "On the page"}
        </span>
        <div className="flex shrink-0 items-center">
          <TooltipIconButton
            tooltip="Resolve"
            group={tips}
            onClick={() => resolve(comment.id)}
            className="text-muted-foreground hover:text-foreground size-7 p-1.5"
          >
            <CheckIcon />
          </TooltipIconButton>
          <TooltipIconButton
            tooltip="Delete"
            group={tips}
            onClick={() => remove(comment.id)}
            className="text-muted-foreground hover:text-foreground size-7 p-1.5"
          >
            <Trash2Icon />
          </TooltipIconButton>
          <TooltipGroup handle={tips} />
        </div>
      </div>
      <div
        ref={scroller}
        className="border-border/60 flex max-h-80 flex-col overflow-y-auto border-t py-1.5"
      >
        {comment.messages.map((message, i) => (
          <Message
            key={message.id}
            message={message}
            // A time only when it moves on from the one above, so a quick
            // back-and-forth isn't a column of "now".
            at={
              shortAgo(comment.times?.[message.id]) ===
              shortAgo(comment.times?.[comment.messages[i - 1]?.id ?? ""])
                ? undefined
                : comment.times?.[message.id]
            }
            streaming={busy && i === comment.messages.length - 1}
            // What it changed, and the way to take it back, sit with the reply
            // that made the change rather than adrift at the bottom.
            footer={
              i === lastReply && changed ? (
                <button
                  type="button"
                  onClick={() => setUndone(comment.id, !comment.undone)}
                  className="text-muted-foreground hover:text-foreground -ms-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-xs transition-colors duration-150 hover:transition-none"
                >
                  {comment.undone ? (
                    <Redo2Icon className="size-3" />
                  ) : (
                    <Undo2Icon className="size-3" />
                  )}
                  {comment.undone ? "Put it back" : "Undo this"}
                </button>
              ) : null
            }
          />
        ))}
        {busy ? (
          // Its face, working: the step it is on, live, the way Liveblocks'
          // agents narrate a placeholder reply.
          !comment.messages.at(-1) || comment.messages.at(-1)?.role === "user" ? (
            <Row who="assistant">
              <Thinking label={progressOf(comment, reading)} className="text-xs" />
            </Row>
          ) : (
            <div className="ps-10 pe-3 pb-1.5">
              <Thinking label={progressOf(comment, reading)} className="text-xs" />
            </div>
          )
        ) : null}
        {comment.error && !busy ? (
          <p className="text-destructive pe-3 pb-1.5 ps-10 text-xs">
            {comment.error.message || "That didn't go through."}
          </p>
        ) : null}
      </div>
      <div className="border-border/60 border-t">
        <Reply placeholder="Reply" onSend={(text) => void reply(comment.id, text)} />
      </div>
    </>
  );
}

/**
 * A face for whoever said it: theirs in ink — a quiet grey at night, where
 * ink is the brightest thing on the card — DearCV's the logo's leaf on the
 * pink of its pin.
 */
function Face({ who }: { who: UIMessage["role"] }) {
  if (who === "user") {
    return (
      <span
        aria-hidden
        className="bg-foreground text-background dark:bg-accent dark:text-foreground grid size-5 shrink-0 place-items-center rounded-full text-[0.5625rem] font-semibold"
      >
        Y
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="bg-brand-leaf grid size-5 shrink-0 place-items-center rounded-full"
    >
      <svg viewBox="128 562 140 145" className="size-3 fill-white">
        <path d={WORDMARK_LEAF_PATH} />
      </svg>
    </span>
  );
}

/** One message's frame: face, name and time on one line, the words under the name. */
function Row({
  who,
  at,
  children,
}: {
  who: UIMessage["role"];
  at?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 px-3 py-1.5">
      <Face who={who} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex h-5 items-center gap-1.5 text-xs">
          <span className="text-foreground font-medium">{who === "user" ? "You" : "DearCV"}</span>
          {at ? <span className="text-muted-foreground">{shortAgo(at)}</span> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * One message: their words, or DearCV's with what it did noted above them
 * in the chat's own small type. The words are the chat's serif and markdown,
 * so a reply reads the same here as on the left.
 */
function Message({
  message,
  at,
  streaming,
  footer,
}: {
  message: UIMessage;
  at?: number;
  streaming?: boolean;
  footer?: React.ReactNode;
}) {
  const parts = message.parts.flatMap((part, i) => {
    if (part.type === "text" && part.text.trim()) {
      return [
        // The chat's spacing is for a column of prose; a card wants it closer.
        <div
          key={i}
          className="font-serif text-[0.8125rem] leading-[1.45] [&_.aui-md-ol]:my-1 [&_.aui-md-p]:my-1 [&_.aui-md-ul]:my-1 [&_.aui-md-ul]:ms-4"
        >
          <TextMessagePartProvider text={part.text.trim()} isRunning={streaming}>
            <MarkdownText />
          </TextMessagePartProvider>
        </div>,
      ];
    }
    if (isToolUIPart(part)) {
      const result = part.state === "output-available" ? part.output : undefined;
      return [<CallNote key={i} name={getToolName(part)} args={part.input} result={result} />];
    }
    return [];
  });
  if (!parts.length) return null;

  return (
    <Row who={message.role} at={at}>
      {parts}
      {footer ? <div className="pt-0.5">{footer}</div> : null}
    </Row>
  );
}

/** The comment box: Enter sends, Shift+Enter breaks the line, Escape lets go. */
function Reply({
  placeholder,
  onSend,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  onSend: (text: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      if (onCancel) onCancel();
      else event.currentTarget.blur();
    }
  };

  return (
    <div className="flex items-end gap-2 py-1.5 pr-2.5 pl-3">
      <textarea
        autoFocus={autoFocus}
        rows={1}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="caret-primary placeholder:text-muted-foreground/70 field-sizing-content max-h-32 min-h-6 flex-1 resize-none bg-transparent py-0.5 text-sm leading-5 outline-none"
      />
      {/* Quiet until there is something to send, like Figma's. */}
      <Button
        size="icon"
        aria-label="Send"
        disabled={!text.trim()}
        onClick={send}
        className="size-6 shrink-0 rounded-full disabled:opacity-25"
      >
        <ArrowUpIcon className="size-3.5" />
      </Button>
    </div>
  );
}
