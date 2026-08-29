import type { ReactNode } from "react";

/**
 * The frame both the editor and its loading state are poured into. They share
 * it rather than each describing it, because any measurement the two disagree
 * on lands as a jump the moment the real one arrives.
 */
export function EditorShell({ pane, sidebar }: { pane: ReactNode; sidebar: ReactNode }) {
  return (
    <main className="flex h-dvh flex-col lg:flex-row">
      <div className="bg-sidebar flex min-h-0 w-full flex-1 flex-col lg:w-[min(28rem,42%)] lg:flex-none">
        {sidebar}
      </div>
      <section className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">{pane}</section>
    </main>
  );
}
