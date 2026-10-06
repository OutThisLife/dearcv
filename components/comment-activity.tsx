"use client";

import { GlyphSpinner } from "@/components/ui/glyph-spinner";
import {
  type Comment,
  askedIn,
  commentsOf,
  isAsking,
  isRunning,
  progressOf,
  useCommentsStore,
  workedFor,
} from "@/lib/comments";
import { useReading } from "@/lib/resume/ingest";
import { useDocumentKey } from "@/lib/store/history";
import { cn } from "@/lib/utils";

/**
 * The chat's side of the comments its own agents are on — the ones made
 * while the chat was busy: one line each, above the composer, saying what
 * the agent is doing as it does it. Work started from
 * the page shows up where the conversation is, the way Copilot puts "started
 * work" in a pull request's timeline and tldraw's agent files canvas asks
 * into its chat history — so a pin dropped on page two is never silent here.
 * A line opens its thread, and brings the pin into view.
 */
export function CommentActivity() {
  const owner = useDocumentKey();
  const all = useCommentsStore((s) => s.comments);
  const open = useCommentsStore((s) => s.open);
  const reading = useReading();
  // A comment the chat answered is already right there in the conversation.
  const comments = commentsOf(all, owner).filter((one) => !one.resolved && one.via === "agent");

  if (!comments.length) return null;

  return (
    <div
      data-comment
      className="shadow-composer animate-in fade-in slide-in-from-bottom-1 flex flex-col overflow-hidden rounded-(--composer-radius) bg-(--composer-bg) py-1 font-sans duration-200 motion-reduce:animate-none"
    >
      {comments.map((comment) => (
        <Line key={comment.id} comment={comment} reading={reading} open={open === comment.id} />
      ))}
    </div>
  );
}

function Line({ comment, reading, open }: { comment: Comment; reading: boolean; open: boolean }) {
  const busy = isRunning(comment);
  const waiting = isAsking(comment);
  const took = workedFor(comment);

  return (
    <button
      type="button"
      aria-label={`Open comment ${comment.n}`}
      onPointerEnter={() => useCommentsStore.setState({ hover: comment.id })}
      onPointerLeave={() => useCommentsStore.setState({ hover: null })}
      onClick={() => {
        useCommentsStore.getState().setOpen(open ? null : comment.id);
        document
          .querySelector(`[data-comment-pin="${comment.id}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }}
      className={cn(
        "hover:bg-muted/50 flex w-full min-w-0 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
        open && "bg-muted/50",
      )}
    >
      {/* The pin it stands for, in miniature. */}
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full rounded-bl-none text-[10px] font-medium tabular-nums",
          waiting ? "bg-brand-leaf text-white" : "bg-foreground text-background",
        )}
      >
        {busy ? <GlyphSpinner className="text-[9px]" /> : comment.n}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{askedIn(comment)}</span>
      <span
        className={cn(
          "max-w-[55%] shrink-0 truncate text-xs",
          waiting ? "text-brand-leaf" : "text-muted-foreground",
          comment.error && !busy && "text-destructive",
        )}
      >
        {progressOf(comment, reading)}
        {!busy && took && !comment.error ? ` · ${took}` : ""}
      </span>
    </button>
  );
}
