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
import { GlyphSpinner } from "@/components/ui/glyph-spinner";
import { Thinking } from "@/components/ui/thinking";
import {
  type Comment,
  type Draft,
  commentsOf,
  hasChanges,
  isAsking,
  isRunning,
  progressOf,
  reply,
  setUndone,
  submitDraft,
  useCommentsStore,
  workedFor,
} from "@/lib/comments";
import { useReading } from "@/lib/resume/ingest";
import type { PdfBoxes } from "@/lib/resume/pdf-boxes";
import { locatePin } from "@/lib/resume/pin-context";
import { useDocumentKey } from "@/lib/store/history";
import { useResumeStore } from "@/lib/store/resume";
import { cn } from "@/lib/utils";

/** The thread card's width, and the gap it keeps from its pin. */
const CARD_PX = 288;
const CARD_GAP = 14;
/** How big a pin is: it points from its bottom-left corner, like Figma's. */
const PIN_PX = 28;

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
                <PinShape spot={spot} className="bg-neutral-950 text-white">
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
        "shadow-composer-focus ring-2 ring-white transition-[scale,background-color] duration-200 hover:scale-110",
        "animate-in fade-in zoom-in-50 ease-smooth-out origin-bottom-left",
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
 * rest, a spinner while it works, and the brand's pink when it has asked
 * something and is waiting on an answer.
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
        // Ink on paper in either theme: the page stays paper at night, and a
        // pin in the theme's foreground turned white on it.
        waiting ? "bg-brand-leaf text-white" : "bg-neutral-950 text-white",
        (open || pointedAt) && "scale-110",
        pointedAt && "ring-brand-leaf",
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
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  return (
    <div
      ref={ref}
      data-comment
      className="shadow-composer-focus animate-in fade-in slide-in-from-left-1 pointer-events-auto absolute scroll-my-20 overflow-hidden rounded-2xl bg-(--composer-bg) duration-200"
      style={{ left, top: spot.y - PIN_PX - 4, width: CARD_PX }}
    >
      {children}
    </div>
  );
}

function Thread({ comment }: { comment: Comment }) {
  const scroller = useRef<HTMLDivElement>(null);
  const { resolve, remove } = useCommentsStore.getState();

  // Stay with the newest words as they stream in.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [comment.messages]);

  const reading = useReading();
  const busy = isRunning(comment);
  const took = workedFor(comment);

  return (
    <>
      <div className="flex items-center justify-between py-1.5 pr-1.5 pl-3.5">
        <span className="text-muted-foreground font-sans text-xs">Comment {comment.n}</span>
        <div className="flex items-center">
          <TooltipIconButton
            tooltip="Resolve"
            side="top"
            onClick={() => resolve(comment.id)}
            className="size-7 p-1.5"
          >
            <CheckIcon />
          </TooltipIconButton>
          <TooltipIconButton
            tooltip="Delete"
            side="top"
            onClick={() => remove(comment.id)}
            className="size-7 p-1.5"
          >
            <Trash2Icon />
          </TooltipIconButton>
        </div>
      </div>
      <div ref={scroller} className="flex max-h-72 flex-col gap-3 overflow-y-auto px-3.5 pb-3">
        {comment.messages.map((message, i) => (
          <Message
            key={message.id}
            message={message}
            streaming={busy && i === comment.messages.length - 1}
          />
        ))}
        {/* The step it is on, live, the way Liveblocks' agents narrate a
            placeholder reply — then how long it took, once it is done. */}
        {busy ? (
          <Thinking label={progressOf(comment, reading)} className="font-sans text-xs" />
        ) : took && !comment.error ? (
          <div className="-my-1 flex items-center justify-between gap-2">
            <span className="text-muted-foreground font-sans text-xs">
              {comment.undone ? "Undone" : `Worked for ${took}`}
            </span>
            {/* Takes back this comment's change alone — not whatever else
                has happened to the page since — and puts it back again. */}
            {hasChanges(comment.id) ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setUndone(comment.id, !comment.undone)}
                className="text-muted-foreground hover:text-foreground -mr-2 font-sans"
              >
                {comment.undone ? (
                  <Redo2Icon data-icon="inline-start" />
                ) : (
                  <Undo2Icon data-icon="inline-start" />
                )}
                {comment.undone ? "Redo" : "Undo"}
              </Button>
            ) : null}
          </div>
        ) : null}
        {comment.error && !busy ? (
          <p className="text-destructive font-sans text-xs">
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

function Message({ message, streaming }: { message: UIMessage; streaming?: boolean }) {
  const parts = message.parts.flatMap((part, i) => {
    if (part.type === "text" && part.text.trim()) {
      // The chat's own markdown, so a reply reads the same here as on the left.
      return [
        // The chat's spacing is for a column of prose; a card wants it closer.
        <div
          key={i}
          className="text-sm leading-relaxed [&_.aui-md-ol]:my-1.5 [&_.aui-md-p]:my-1.5 [&_.aui-md-ul]:my-1.5 [&_.aui-md-ul]:ms-4"
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
    <div className="flex flex-col gap-1">
      <span className="text-foreground font-sans text-xs font-medium">
        {message.role === "user" ? "You" : "DearCV"}
      </span>
      {parts}
    </div>
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
    <div className="flex items-end gap-1.5 py-1.5 pr-1.5 pl-3.5">
      <textarea
        autoFocus={autoFocus}
        rows={1}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="caret-primary placeholder:text-muted-foreground/60 field-sizing-content max-h-32 min-h-7 flex-1 resize-none bg-transparent py-1 font-sans text-sm leading-5 outline-none"
      />
      <Button
        size="icon"
        aria-label="Send"
        disabled={!text.trim()}
        onClick={send}
        className="size-7 shrink-0 rounded-full"
      >
        <ArrowUpIcon className="size-4" />
      </Button>
    </div>
  );
}
