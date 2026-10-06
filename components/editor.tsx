"use client";

import type { UIMessage } from "ai";
import { useEffect, useState } from "react";
import { Assistant } from "@/components/assistant";
import { EditorShell } from "@/components/editor-shell";
import { PdfDropZone } from "@/components/pdf-drop-zone";
import { ResumePane } from "@/components/resume-pane";
import { ThreadSync } from "@/components/thread-sync";
import { seedResume, type SeededResume } from "@/lib/store/resume";
import { DEMO_MESSAGES } from "@/lib/dev/demo-thread";
import type { StoredHistory } from "@/lib/resume/history";
import { seedHistory } from "@/lib/store/history";
import { seedThread, useThreadStore } from "@/lib/store/thread";

export type ThreadSeed = SeededResume & {
  /** Absent for a new thread, which gets one in the browser. */
  id?: string;
  messages?: UIMessage[];
  history?: StoredHistory | null;
};

export function Editor({ seed }: { seed: ThreadSeed }) {
  // Held rather than derived, so a new thread keeps the one id it was given
  // even if this initialiser runs twice.
  const [id] = useState(() => seed.id ?? crypto.randomUUID());

  // Seeded during the first render so a stored resume is on screen in the
  // first paint instead of arriving after it. An effect would be the ordinary
  // place for this, but the children read the stores as they render, and a
  // pass with an empty one resets the chat before the real messages land.
  //
  // Guarded to the browser: the stores are module singletons, and on the
  // server one request's resume would bleed into the next one's HTML. Guarded
  // against a second run too — a re-mount over a live tree would otherwise
  // write to the stores while ThreadSync was already subscribed, which is a
  // setState during someone else's render.
  useState(() => {
    if (typeof window === "undefined") return;
    if (useThreadStore.getState().id === id) return;

    seedThread({
      id,
      messages: demo() ? DEMO_MESSAGES : seed.messages,
      addressed: Boolean(seed.id),
    });
    seedResume({ ...seed, id });
    // After the resume, since it is filed under the resume it belongs to.
    seedHistory(seed.history);
  });

  return (
    <PdfDropZone>
      <ThreadSync />
      {process.env.NODE_ENV === "development" ? <DemoSeed /> : null}
      <EditorShell sidebar={<Assistant />} pane={<ResumePane />} />
    </PdfDropZone>
  );
}

/**
 * Development only: `/?demo` opens a sample conversation and the resume it
 * edited, with its history to step through. The messages go in with the
 * thread's first seed, since the chat reads them once at mount; the page and
 * its history follow once the sample PDF has been read.
 */
const demo = () =>
  process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).has("demo");

function DemoSeed() {
  useEffect(() => {
    if (!demo()) return;
    void import("@/lib/dev/demo-history").then(({ seedDemoHistory }) => seedDemoHistory());
  }, []);
  return null;
}
