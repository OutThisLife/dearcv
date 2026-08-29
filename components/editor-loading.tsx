import { DearCvWordmark } from "@/components/dearcv-wordmark";
import { EditorShell } from "@/components/editor-shell";
import { Thinking } from "@/components/ui/thinking";

/**
 * What a saved thread shows while its editor is still on the wire. Everything
 * that doesn't depend on the thread — the frame, both headers, the wordmark —
 * is already sitting where it will stay, so the resume arrives into a settled
 * page instead of shoving one into place around it.
 */
export function EditorLoading() {
  return (
    <EditorShell
      sidebar={
        <>
          <header className="flex h-12 shrink-0 items-center px-4">
            <DearCvWordmark />
          </header>
          <div className="grid min-h-0 flex-1 place-items-center">
            {/* Held back so a load that finishes quickly never shows a spinner
                at all — a flash of one is the same flicker, just shorter. */}
            <Thinking
              className="animate-in fade-in fill-mode-both delay-300 duration-200"
              label="Picking up where you left off"
            />
          </div>
        </>
      }
      pane={<header className="h-12 shrink-0" />}
    />
  );
}
