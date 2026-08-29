"use client";

import type { UIMessage } from "ai";
import { useState } from "react";
import { Assistant } from "@/components/assistant";
import { PdfDropZone } from "@/components/pdf-drop-zone";
import { ResumePane } from "@/components/resume-pane";
import { ThreadSync } from "@/components/thread-sync";
import { seedResume, type SeededResume } from "@/lib/store/resume";
import { seedThread } from "@/lib/store/thread";

export type ThreadSeed = SeededResume & {
  /** Absent for a new thread, which gets one in the browser. */
  id?: string;
  messages?: UIMessage[];
};

export function Editor({ seed }: { seed: ThreadSeed }) {
  // Seeded during the first render so a stored resume is on screen in the
  // first paint instead of arriving after it. Guarded to the browser: the
  // stores are module singletons, and on the server one request's resume
  // would bleed into the next one's HTML.
  useState(() => {
    if (typeof window === "undefined") return;
    seedThread({
      id: seed.id ?? crypto.randomUUID(),
      messages: seed.messages,
      addressed: Boolean(seed.id),
    });
    seedResume(seed);
  });

  return (
    <PdfDropZone>
      <ThreadSync />
      <main className="flex h-dvh flex-col lg:flex-row">
        <div className="bg-sidebar flex min-h-0 w-full flex-1 flex-col lg:w-[min(28rem,42%)] lg:flex-none">
          <Assistant />
        </div>
        <ResumePane />
      </main>
    </PdfDropZone>
  );
}
