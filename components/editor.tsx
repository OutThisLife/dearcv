"use client";

import type { UIMessage } from "ai";
import { useState } from "react";
import { Assistant } from "@/components/assistant";
import { EditorShell } from "@/components/editor-shell";
import { PdfDropZone } from "@/components/pdf-drop-zone";
import { ResumePane } from "@/components/resume-pane";
import { ThreadSync } from "@/components/thread-sync";
import { seedResume, type SeededResume } from "@/lib/store/resume";
import { seedThread, useThreadStore } from "@/lib/store/thread";

export type ThreadSeed = SeededResume & {
  /** Absent for a new thread, which gets one in the browser. */
  id?: string;
  messages?: UIMessage[];
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

    seedThread({ id, messages: seed.messages, addressed: Boolean(seed.id) });
    seedResume({ ...seed, id });
  });

  return (
    <PdfDropZone>
      <ThreadSync />
      <EditorShell sidebar={<Assistant />} pane={<ResumePane />} />
    </PdfDropZone>
  );
}
