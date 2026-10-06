"use client";

import { useAISDKChat } from "@assistant-ui/ai-sdk";
import { isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { type Revision, useHistoryStore } from "@/lib/store/history";
import { type ReplayScript, useReplayStore } from "@/lib/store/replay";
import { useResumeStore } from "@/lib/store/resume";

/**
 * Plays a session back (`?replay` on a thread): every turn said again in
 * order — their message, then the answer arriving part by part, its text
 * written out — and each request's edit landing on the page as its tool call
 * appears, through history's own step so it flashes the way it did live.
 *
 * Turns and edits are tied by the request id every history step carries: the
 * message it answers, or the comment it was made for. Steps no message made
 * (a comment's own agent, undoing a comment) play in their place in the
 * history's order. A turn whose edit was later undone and branched away from
 * shows without changing the page, since that version is gone.
 */

/** Paces at 1×, in ms. */
const OPEN = 600;
const ASKED = 650;
const PART = 420;
const TURN = 850;
const LAND = 300;
/** A reply's text is written out over at most this long, however long it is. */
const WRITE_MAX = 1400;
const WRITE_PER_WORD = 22;
const WRITE_CHUNKS = 24;

type Beat = { messages: UIMessage[]; step?: number; wait: number };
type Turn = { user: UIMessage | null; replies: UIMessage[] };

const commentOf = (message: UIMessage) => {
  const id = (message.metadata as { custom?: { commentId?: unknown } } | undefined)?.custom
    ?.commentId;
  return typeof id === "string" ? id : null;
};

function turnsOf(messages: UIMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.role === "user") turns.push({ user: message, replies: [] });
    else if (turns.length) turns.at(-1)!.replies.push(message);
    else turns.push({ user: null, replies: [message] });
  }
  return turns;
}

/** The newest history step each turn made, by the request it answers. */
function stepsOf(turns: Turn[], revisions: Revision[]) {
  const made = new Map<number, number>();
  turns.forEach((turn, t) => {
    if (!turn.user) return;
    const ids = new Set([turn.user.id, commentOf(turn.user)].filter(Boolean));
    revisions.forEach((revision, r) => {
      if (r > 0 && revision.request && ids.has(revision.request)) made.set(t, r);
    });
  });
  return made;
}

/** Text written out a few words at a time, the way it streamed in. */
function writing(text: string, speed: number) {
  const words = text.split(/(\s+)/);
  const chunks = Math.min(WRITE_CHUNKS, Math.ceil(words.length / 2));
  if (chunks <= 1) return [{ text, wait: PART / speed }];
  const total = Math.min(WRITE_MAX, words.length * WRITE_PER_WORD) / speed;
  return Array.from({ length: chunks }, (_, i) => ({
    text: words.slice(0, Math.ceil(((i + 1) / chunks) * words.length)).join(""),
    wait: total / chunks,
  }));
}

/**
 * A tool call the session left without an answer (a stopped turn) is closed
 * before it is shown again: an open frontend call is one the runtime would
 * run, and a replay must never edit the page itself.
 */
const closed = (message: UIMessage): UIMessage => ({
  ...message,
  parts: message.parts.map((part) =>
    isToolUIPart(part) && !part.state.startsWith("output-")
      ? ({ ...part, state: "output-error", errorText: "Stopped." } as typeof part)
      : part,
  ),
});

function beatsOf(script: ReplayScript, revisions: Revision[]): Beat[] {
  const { speed } = script;
  const messages = script.messages.map(closed);
  const turns = turnsOf(messages);
  const made = stepsOf(turns, revisions);
  const claimed = new Set(made.values());
  const beats: Beat[] = [];
  let shown: UIMessage[] = [];
  let applied = 0;

  // Steps no message made play where history has them: before the first
  // turn whose own step comes after them.
  const flush = (before: number) => {
    for (let r = applied + 1; r < Math.min(before, revisions.length); r++) {
      if (claimed.has(r)) continue;
      beats.push({ messages: shown, step: r, wait: TURN / speed });
      applied = r;
    }
  };

  turns.forEach((turn, t) => {
    const step = made.get(t);
    const later = [...made.entries()].filter(([at]) => at >= t).map(([, r]) => r);
    flush(later.length ? Math.min(...later) : 0);

    if (turn.user) {
      shown = [...shown, turn.user];
      beats.push({ messages: shown, wait: ASKED / speed });
    }

    // The edit lands with the turn's last tool call, or at its end if it
    // made one without any showing.
    const tools = turn.replies.flatMap((reply, m) =>
      reply.parts.flatMap((part, p) => (isToolUIPart(part) ? [[m, p] as const] : [])),
    );
    const [lastReply, lastPart] = tools.at(-1) ?? [-1, -1];
    let landed = step === undefined;

    turn.replies.forEach((reply, m) => {
      const before = shown;
      const parts: UIMessage["parts"] = [];
      reply.parts.forEach((part, p) => {
        const show = (next: UIMessage["parts"], wait: number, lands = false) => {
          shown = [...before, { ...reply, parts: next }];
          beats.push({ messages: shown, wait, step: lands ? step : undefined });
        };
        if (part.type === "text" || part.type === "reasoning") {
          for (const chunk of writing(part.text, speed)) {
            show([...parts, { ...part, text: chunk.text }], chunk.wait);
          }
        } else if (isToolUIPart(part)) {
          const lands = !landed && m === lastReply && p === lastPart;
          if (lands) landed = true;
          show([...parts, part], (lands ? PART + LAND : PART) / speed, lands);
        } else if (part.type !== "step-start") {
          show([...parts, part], PART / 2 / speed);
        }
        parts.push(part);
      });
      shown = [...before, reply];
    });

    if (!landed) beats.push({ messages: shown, step, wait: LAND / speed });
    if (step !== undefined) applied = Math.max(applied, step);
    beats.push({ messages: shown, wait: TURN / speed });
  });

  flush(Infinity);
  return beats;
}

/** Puts the page on a step at once, with no flash: where a replay starts or is skipped to. */
function settle(at: number) {
  const revision = useHistoryStore.getState().revisions[at];
  if (!revision) return;
  useResumeStore.setState({ doc: revision.doc, touched: revision.touched });
  useHistoryStore.setState({ at });
}

/**
 * Called with the thread's first seed, after its history: the page starts on
 * the first step, so the opening frame is the session's start rather than
 * its end flickering past.
 */
export function seedReplay(script: ReplayScript) {
  settle(0);
  useReplayStore.setState({ active: true, script });
}

export function SessionReplay() {
  const chat = useAISDKChat();
  // The helpers object is rebuilt on every message change, which is every
  // beat; the player holds the newest without restarting.
  const latest = useRef(chat);
  latest.current = chat;
  const ready = Boolean(chat);

  useEffect(() => {
    const script = useReplayStore.getState().script;
    if (!ready || !script) return;

    const beats = beatsOf(script, useHistoryStore.getState().revisions);
    const set = (messages: UIMessage[]) => latest.current?.setMessages(messages);
    let i = 0;
    let timer = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      set(script.messages.map(closed));
      const { at, go } = useHistoryStore.getState();
      if (at !== script.at) go(script.at);
      useReplayStore.setState({ active: false, script: null, skip: null });
      // Played once: a reload from here is the session, not another showing.
      const url = new URL(window.location.href);
      url.searchParams.delete("replay");
      window.history.replaceState(window.history.state, "", url);
    };

    const tick = () => {
      if (done) return;
      const beat = beats[i++];
      if (!beat) return finish();
      set(beat.messages);
      if (beat.step !== undefined) useHistoryStore.getState().go(beat.step);
      timer = window.setTimeout(tick, beat.wait);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finish();
    };

    settle(0);
    set([]);
    useReplayStore.setState({ skip: finish });
    window.addEventListener("keydown", onKey);
    timer = window.setTimeout(tick, OPEN / script.speed);

    return () => {
      // Development mounts twice; the second run starts it over.
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [ready]);

  return null;
}
