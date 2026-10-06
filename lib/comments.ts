import {
  AbstractChat,
  type ChatState,
  type ChatStatus,
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { create } from "zustand";
import { callText, runTool, toolCopying, toolSchemas, toolTarget } from "@/components/resume-tools";
import { ensureCarried, follow } from "@/lib/resume/ingest";
import { isEmptyResume } from "@/lib/resume/schema";
import { useActivityStore } from "@/lib/store/activity";
import { authHeaders } from "@/lib/store/auth";
import { changedBoxes } from "@/lib/resume/pdf-boxes";
import { partsChanged, restoreParts } from "@/lib/resume/revert";
import { documentKey, historyBrief, useHistoryStore } from "@/lib/store/history";
import { useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";

/**
 * Comments pinned to the page, Figma-style, each with its own agent.
 *
 * A comment is a conversation of its own: what was asked at that spot, and
 * the model's answer — an edit, a reply, or a question back when it cannot
 * tell what is meant. Every comment runs on its own, alongside the chat and
 * alongside each other, so several things can be asked of the page at once
 * and worked on together. They all edit the one document through the same
 * tools the chat uses, each reading it fresh at the moment it acts.
 *
 * Where a comment sits is told to its agent in words — the page, the line
 * under the pin, the word, the lines around it, the role or section it falls
 * in — worked out when it is dropped, from what was on screen.
 */

/** A point on a page, in PDF points from its top left. */
export type Pin = { page: number; x: number; y: number };

/**
 * The part of the resume a pin was dropped on, and where in it as a fraction
 * of its box, so the pin follows that part when an edit moves it.
 */
export type Anchor = { box: string; fx: number; fy: number };

/** A pin about to become a comment: placed, and waiting for its words. */
export type Draft = { pin: Pin; anchor: Anchor | null; where: string };

export type Comment = Draft & {
  id: string;
  /**
   * Who is answering it. A comment made while the chat is free goes to the
   * chat itself — it is the conversation, shown on the left with its pin —
   * and only one made while the chat is busy gets an agent of its own, so
   * it can be worked on at the same time.
   */
  via: "chat" | "agent";
  /** Shown on the pin, in the order they were made. */
  n: number;
  /** Which resume it belongs to. */
  owner: string;
  messages: UIMessage[];
  status: ChatStatus;
  error?: Error;
  resolved: boolean;
  /** When its agent last started on it, and finished — the thread says how long it worked. */
  startedAt?: number;
  finishedAt?: number;
  /** Its changes have been taken back, and can be put back again. */
  undone?: boolean;
};

type CommentsState = {
  comments: Comment[];
  /** Clicking the page drops a pin, rather than doing whatever a click does. */
  placing: boolean;
  draft: Draft | null;
  /** The comment whose thread is showing. */
  open: string | null;
  /** The comment being pointed at from the chat, whose pin lifts to say where it is. */
  hover: string | null;
  setPlacing: (placing: boolean) => void;
  place: (draft: Draft) => void;
  cancelDraft: () => void;
  setOpen: (id: string | null) => void;
  resolve: (id: string) => void;
  remove: (id: string) => void;
};

export const useCommentsStore = create<CommentsState>()((set) => ({
  comments: [],
  placing: false,
  draft: null,
  open: null,
  hover: null,
  setPlacing: (placing) => set({ placing, ...(placing ? { open: null } : { draft: null }) }),
  place: (draft) => set({ draft, placing: false, open: null }),
  cancelDraft: () => set({ draft: null }),
  setOpen: (open) => set({ open, draft: null, placing: false }),
  resolve: (id) => {
    void chats.get(id)?.stop();
    set((state) => ({
      comments: state.comments.map((one) => (one.id === id ? { ...one, resolved: true } : one)),
      open: state.open === id ? null : state.open,
    }));
  },
  remove: (id) => {
    void chats.get(id)?.stop();
    chats.delete(id);
    set((state) => ({
      comments: state.comments.filter((one) => one.id !== id),
      open: state.open === id ? null : state.open,
    }));
  },
}));

const patch = (id: string, change: Partial<Comment>) =>
  useCommentsStore.setState((state) => ({
    comments: state.comments.map((one) => (one.id === id ? { ...one, ...change } : one)),
  }));

const commentOf = (id: string) => useCommentsStore.getState().comments.find((one) => one.id === id);

/** What the history calls this comment's edits: its first words, as it would a chat message. */
const askOf = (id: string) => {
  const first = commentOf(id)?.messages.find((message) => message.role === "user");
  const text = first?.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ");
  return { id, text: text?.replace(/\s+/g, " ").trim() ?? "" };
};

const ours = new Set(Object.keys(toolSchemas()));

/**
 * A comment's conversation kept in the store rather than in a component, so
 * it carries on while its thread is closed — and the page shows what each
 * call is working on as its arguments stream in, the same as the chat's.
 */
class StoreChatState implements ChatState<UIMessage> {
  private working = new Set<string>();
  private copying = false;

  constructor(private id: string) {}

  get status() {
    return commentOf(this.id)?.status ?? "ready";
  }
  set status(status: ChatStatus) {
    const was = this.status;
    const busy = status === "submitted" || status === "streaming";
    const wasBusy = was === "submitted" || was === "streaming";
    // Timed from what was asked, not from each step: the agent picks back up
    // after every edit it makes, and those restarts are all one piece of work.
    const asked = this.messages.at(-1)?.role === "user";
    patch(this.id, {
      status,
      ...(busy && !wasBusy && asked ? { startedAt: Date.now() } : {}),
      ...(busy ? { finishedAt: undefined } : {}),
      ...(!busy && wasBusy ? { finishedAt: Date.now() } : {}),
    });
    if (!busy) this.track([]);
  }
  get error() {
    return commentOf(this.id)?.error;
  }
  set error(error: Error | undefined) {
    patch(this.id, { error });
  }
  get messages() {
    return commentOf(this.id)?.messages ?? [];
  }
  set messages(messages: UIMessage[]) {
    patch(this.id, { messages });
    this.track(messages);
  }
  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
  };
  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };
  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = this.messages.map((one, i) => (i === index ? message : one));
  };
  snapshot = <T>(thing: T): T => structuredClone(thing);

  /** Calls still arriving or running hold their place on the page; finished ones let go. */
  private track(messages: UIMessage[]) {
    const activity = useActivityStore.getState();
    const now = new Set<string>();
    let copying: string | undefined;
    for (const part of messages.at(-1)?.parts ?? []) {
      if (!isToolUIPart(part) || !ours.has(getToolName(part))) continue;
      if (part.state !== "input-streaming" && part.state !== "input-available") continue;
      copying ??= toolCopying(getToolName(part), part.input);
      const target = toolTarget(getToolName(part), part.input);
      if (!target) continue;
      now.add(part.toolCallId);
      activity.work(part.toolCallId, target);
    }
    for (const call of this.working) if (!now.has(call)) activity.done(call);
    this.working = now;

    // A whole resume being written out moves the reading head down the page.
    if (copying) follow(copying);
    else if (this.copying) activity.readTo(null);
    this.copying = Boolean(copying);
  }
}

class CommentChat extends AbstractChat<UIMessage> {}

const chats = new Map<string, CommentChat>();

function chatFor(id: string) {
  const existing = chats.get(id);
  if (existing) return existing;

  const chat: CommentChat = new CommentChat({
    id,
    state: new StoreChatState(id),
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: () => authHeaders(),
      body: async () => {
        // A comment on an upload still being read waits for it, as the chat does.
        await ensureCarried();
        const { doc, sourceText } = useResumeStore.getState();
        return {
          doc,
          sourceText: isEmptyResume(doc) ? sourceText : "",
          tools: toolSchemas(),
          comment: commentOf(id)?.where ?? "",
          undone: historyBrief(),
        };
      },
    }),
    onToolCall: ({ toolCall }) => {
      // Search and page reads run on the server and answer for themselves.
      if (!ours.has(toolCall.toolName)) return;
      const { toolName: tool, toolCallId } = toolCall;
      try {
        const output = runTool(tool, toolCall.input, askOf(id));
        void chat.addToolOutput({ tool, toolCallId, output });
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        void chat.addToolOutput({ state: "output-error", tool, toolCallId, errorText });
      }
    },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
  chats.set(id, chat);
  return chat;
}

/**
 * The chat on the left, as comments reach it: registered by the chat's own
 * runtime, which is the only thing that can send into it.
 */
export type ChatLink = {
  busy: () => boolean;
  /** Says it in the chat, tagged as this comment's, cancelling a reply in progress first. */
  send: (commentId: string, text: string) => Promise<void>;
};

let link: ChatLink | null = null;

export function linkChat(chat: ChatLink) {
  link = chat;
  return () => {
    if (link === chat) link = null;
  };
}

/** The comment the chat is answering right now, so its turn is told where the pin is. */
let inChat: string | null = null;

/** Where the comment the chat is on is pinned, for its request; empty for an ordinary turn. */
export const chatCommentWhere = () => (inChat ? (commentOf(inChat)?.where ?? "") : "");

/** Turns the waiting pin into a comment and gets it answered: by the chat when it is free, alongside it when it is not. */
export function submitDraft(text: string) {
  const { draft, comments } = useCommentsStore.getState();
  const words = text.trim();
  if (!draft || !words) return;

  const owner = documentKey();
  const via = link && !link.busy() ? "chat" : "agent";
  const comment: Comment = {
    ...draft,
    id: crypto.randomUUID(),
    via,
    n: comments.filter((one) => one.owner === owner).length + 1,
    owner,
    messages: [],
    status: "ready",
    resolved: false,
  };
  useCommentsStore.setState({ comments: [...comments, comment], draft: null, open: comment.id });
  if (via === "chat") {
    inChat = comment.id;
    patch(comment.id, { startedAt: Date.now() });
    void link!.send(comment.id, words);
  } else {
    void chatFor(comment.id).sendMessage({ text: words });
  }
}

/**
 * Answers a comment's agent. Mid-reply it steers, as the chat does: what it
 * has done so far stays done, and it picks up with the new words in view.
 */
export async function reply(id: string, text: string) {
  const words = text.trim();
  if (!words) return;
  if (commentOf(id)?.via === "chat" && link) {
    patch(id, { resolved: false, undone: false, startedAt: Date.now(), finishedAt: undefined });
    inChat = id;
    return link.send(id, words);
  }
  const chat = chatFor(id);
  if (chat.status === "streaming" || chat.status === "submitted") await chat.stop();
  // Whatever it does next is new work: an undone change stays undone, and
  // Undo then means the new one.
  patch(id, { resolved: false, undone: false });
  void chat.sendMessage({ text: words });
}

/** The comments on the resume on screen. */
export const commentsOf = (comments: Comment[], owner: string) =>
  comments.filter((one) => one.owner === owner);

const textOf = (message: UIMessage | undefined) =>
  (message?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("")
    .trim();

/** Its agent is on it right now. */
export const isRunning = (comment: Comment) =>
  comment.status === "submitted" || comment.status === "streaming";

/** Waiting on them: the agent's last word was a question. */
export const isAsking = (comment: Comment) => {
  const last = comment.messages.at(-1);
  return !isRunning(comment) && last?.role === "assistant" && textOf(last).endsWith("?");
};

/** What was asked, in their words: the first thing said in the thread. */
export const askedIn = (comment: Comment) =>
  textOf(comment.messages.find((message) => message.role === "user"));

/** How long its agent last worked, as a short duration. */
export function workedFor(comment: Comment) {
  if (!comment.startedAt || !comment.finishedAt) return undefined;
  const seconds = Math.max(1, Math.round((comment.finishedAt - comment.startedAt) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * What a comment's agent is doing, in a few words, for anything that shows
 * it without the whole thread: read off the conversation itself, so it is
 * only ever what is actually happening — waiting on the upload, the edit
 * whose arguments are streaming in, the reply being written.
 */
export function progressOf(comment: Comment, reading: boolean) {
  const last = comment.messages.at(-1);
  const parts = last?.role === "assistant" ? last.parts : [];
  const tool = parts.findLast(isToolUIPart);
  const toolText =
    tool &&
    callText(
      getToolName(tool),
      tool.input,
      tool.state === "output-available" ? tool.output : undefined,
    );

  if (isRunning(comment)) {
    if (!parts.length && reading) return "Reading your resume first";
    if (tool && (tool.state === "input-streaming" || tool.state === "input-available"))
      return toolText!;
    if (textOf(last)) return "Replying";
    return "Thinking";
  }
  if (comment.error) return "Didn't go through";
  if (comment.undone) return "Undone";
  if (isAsking(comment)) return "Asked you something";
  return toolText ?? "Replied";
}

/**
 * The open comments, told to the chat: each runs on its own, but the chat is
 * where they ask about them — "what did comment 2 do?", "undo what you did
 * on the first one" — so it is told what each was asked, where, and how it
 * went.
 */
export function commentsBrief() {
  const owner = documentKey();
  const open = commentsOf(useCommentsStore.getState().comments, owner).filter(
    (one) => !one.resolved,
  );
  return open
    .map((comment) => {
      const reply = textOf(comment.messages.findLast((message) => message.role === "assistant"));
      return [
        `Comment ${comment.n}: ${JSON.stringify(askedIn(comment))}`,
        `  Pinned: ${comment.where.split("\n").slice(1, 2).join(" ") || comment.where.split("\n")[0]}`,
        `  Status: ${progressOf(comment, false)}`,
        reply ? `  Its reply: ${JSON.stringify(reply)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/** What this comment's agent changed: each of its steps in history, and the page just before it. */
const stepsOf = (id: string) => {
  const { revisions } = useHistoryStore.getState();
  return revisions.flatMap((revision, i) =>
    revision.request === id && revisions[i - 1]
      ? [{ before: revisions[i - 1]!.doc, after: revision.doc }]
      : [],
  );
};

/** Whether there is anything of this comment's on the page to take back. */
export const hasChanges = (id: string) => stepsOf(id).length > 0;

/**
 * Takes back what a comment's agent did — only that, part by part, leaving
 * whatever else has happened to the page since — or puts it back. Either is
 * a step of its own in history, so ⌘Z walks back through it like any edit.
 */
export function setUndone(id: string, undone: boolean) {
  const comment = commentOf(id);
  const steps = stepsOf(id);
  if (!comment || !steps.length || Boolean(comment.undone) === undone) return;

  const resume = useResumeStore.getState();
  const was = resume.doc;
  const ordered = undone ? [...steps].reverse() : steps;
  const doc = ordered.reduce(
    (now, step) =>
      restoreParts(now, undone ? step.before : step.after, partsChanged(step.before, step.after)),
    was,
  );

  const history = useHistoryStore.getState();
  history.begin();
  resume.patchDoc({ basics: doc.basics, sections: doc.sections, theme: doc.theme });
  const what = `${undone ? "Undid" : "Redid"} comment ${comment.n}`;
  history.record(what, { id: `${id}:${undone ? "undo" : "redo"}:${Date.now()}`, text: what });

  // Shown the way the change was the first time: flashed where it lands.
  const changed = changedBoxes(was, doc);
  const marks = useMarksStore.getState();
  changed.forEach(marks.mark);
  if (changed[0]) useActivityStore.getState().point(changed[0]);

  patch(id, { undone });
}

/** A message in the chat's own shape, as far as a comment's thread needs it. */
type ChatMessage = {
  id: string;
  role: string;
  content: readonly {
    type: string;
    text?: string;
    toolName?: string;
    toolCallId?: string;
    args?: unknown;
    result?: unknown;
  }[];
  metadata?: { custom?: Record<string, unknown> };
};

/**
 * Keeps each chat-answered comment's thread in step with the chat: its
 * messages are the chat's, from the comment's own words to the next thing
 * said, so the pin and the left side always tell the same story.
 */
export function mirrorChat(messages: readonly ChatMessage[], running: boolean) {
  const lastAsk = messages.findLast((message) => message.role === "user");
  if (!running && inChat && lastAsk?.metadata?.custom?.commentId === inChat) inChat = null;

  for (const comment of useCommentsStore.getState().comments) {
    if (comment.via !== "chat") continue;
    const mine: UIMessage[] = [];
    let ours = false;
    for (const message of messages) {
      if (message.role === "user") ours = message.metadata?.custom?.commentId === comment.id;
      if (!ours) continue;
      mine.push({
        id: message.id,
        role: message.role as UIMessage["role"],
        parts: message.content.flatMap((part): UIMessage["parts"] => {
          if (part.type === "text" && part.text) return [{ type: "text", text: part.text }];
          if (part.type === "tool-call" && part.toolName && part.toolCallId) {
            return [
              {
                type: `tool-${part.toolName}`,
                toolCallId: part.toolCallId,
                state: part.result === undefined ? "input-available" : "output-available",
                input: part.args,
                output: part.result,
              } as UIMessage["parts"][number],
            ];
          }
          return [];
        }),
      });
    }

    const busy = running && lastAsk?.metadata?.custom?.commentId === comment.id;
    const status: ChatStatus = busy ? "streaming" : "ready";
    const was = isRunning(comment);
    const change: Partial<Comment> = { messages: mine, status };
    // The clock started when it was sent (the chat's own timestamps move as
    // it rebuilds its messages); it stops when the chat is done with it.
    if (busy) change.finishedAt = undefined;
    if (!busy && was) change.finishedAt = Date.now();
    if (
      JSON.stringify(mine) !== JSON.stringify(comment.messages) ||
      status !== comment.status ||
      Boolean(change.finishedAt) !== Boolean(comment.finishedAt)
    ) {
      patch(comment.id, change);
    }
  }
}

/** Where a comment is, in a few words: the entry it is on, or else the line under it. */
export function placeOf(comment: Comment) {
  const part = comment.where.match(/It falls in (?:the entry |the )?“([^”]+)”/)?.[1];
  if (part) return part;
  // The painted line, less the bullet the page draws in front of it.
  const line = comment.where
    .match(/(?:On the line|nearest to) “([^”]+)”/)?.[1]
    ?.replace(/^[•●▪■◦‣–—-]\s*/u, "");
  return line && line.length > 36 ? `${line.slice(0, 34).trimEnd()}…` : line;
}
