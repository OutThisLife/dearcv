"use client";

import { CheckIcon, DownloadIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ResumePreview } from "@/components/resume-preview";
import { Button } from "@/components/ui/button";
import { useHistoryStore } from "@/lib/store/history";
import { useResumeStore } from "@/lib/store/resume";
import { cn } from "@/lib/utils";

/** How long a confirmation or a "saved" tick stays before the button goes back to rest. */
const ARMED_MS = 3000;
const SAVED_MS = 1800;

/**
 * Both labels share one grid cell, so the button is as wide as the longer
 * one from the start and swapping never nudges its neighbour. The one not
 * showing shrinks and fades out, as assistant-ui's copy icon turns into a tick.
 */
const SWAP =
  "col-start-1 row-start-1 transition-[opacity,scale] duration-150 ease-aui motion-reduce:transition-none";
const SWAP_OUT = "scale-75 opacity-0";

export function ResumePane() {
  const touched = useResumeStore((s) => s.touched);
  const sourceName = useResumeStore((s) => s.sourceName);
  const originalUrl = useResumeStore((s) => s.originalUrl);
  const previewUrl = useResumeStore((s) => s.previewUrl);
  const error = useResumeStore((s) => s.error);

  // Actions are created once and never replaced, so subscribing to one is a
  // hook and a selector spent fetching a constant. Reached at the click.
  const { setError } = useResumeStore.getState();

  // What Save hands over is what the pane is showing: their own file until
  // something is edited, our redraw of it after.
  const saveUrl = originalUrl && !touched ? originalUrl : previewUrl;

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-4">
        {/* The file's own line, since every one of these is about the file.
            A floating alert would be more chrome for something that belongs
            exactly where the name it replaces sits. */}
        {error ? (
          <button
            type="button"
            role="alert"
            onClick={() => setError(null)}
            title="Dismiss"
            className="text-destructive min-w-0 cursor-pointer truncate text-left text-xs"
          >
            {error}
          </button>
        ) : (
          <p className="text-muted-foreground min-w-0 truncate text-xs">
            {sourceName || "Your resume"}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          {saveUrl ? <ResetButton /> : null}
          <SaveButton url={saveUrl} />
        </div>
      </header>

      <ResumePreview />
    </>
  );
}

/**
 * Throws away the resume and everything done to it, so it asks once: the
 * first press turns it into a "Sure?" that a second press confirms, and that
 * lets go by itself if the second never comes.
 */
function ResetButton() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), ARMED_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      variant={armed ? "destructive" : "ghost"}
      size="sm"
      aria-label={armed ? "Confirm reset" : "Reset"}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        useResumeStore.getState().resetBlank();
        // A fresh start has nothing behind it to step back to.
        useHistoryStore.setState({ revisions: [], at: 0 });
      }}
      className="animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      {/* Winds back half a turn as it arms: the icon already says what's about to happen. */}
      <RotateCcwIcon
        data-icon="inline-start"
        className={cn(
          "ease-aui transition-transform duration-200 motion-reduce:transition-none",
          armed && "-rotate-180",
        )}
      />
      <span className="grid">
        <span className={cn(SWAP, armed && SWAP_OUT)}>Reset</span>
        <span className={cn(SWAP, !armed && SWAP_OUT)}>Sure?</span>
      </span>
    </Button>
  );
}

/**
 * The one thing the page is for, so it is the one solid button in the pane. The arrow dips toward the download on hover, and turns into a tick
 * once the file is on its way.
 */
function SaveButton({ url }: { url: string | null }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), SAVED_MS);
    return () => window.clearTimeout(timer);
  }, [saved]);

  return (
    <Button
      variant="default"
      size="sm"
      disabled={!url}
      onClick={() => {
        if (!url) return;
        // Read at the click rather than subscribed: the name is wanted
        // once, and holding the whole document for it would redraw this
        // header on every keystroke the model makes.
        const { name } = useResumeStore.getState().doc.basics;
        const a = document.createElement("a");
        a.href = url;
        a.download = name ? `${name.replace(/\s+/g, "-")}-resume.pdf` : "resume.pdf";
        a.click();
        setSaved(true);
      }}
    >
      <span data-icon="inline-start" className="grid size-3.5 place-items-center">
        <DownloadIcon
          className={cn(
            SWAP,
            "size-3.5 transition-[opacity,scale,filter,translate] group-hover/button:translate-y-px",
            saved && SWAP_OUT,
          )}
        />
        <CheckIcon className={cn(SWAP, "size-3.5", !saved && SWAP_OUT)} />
      </span>
      Save PDF
    </Button>
  );
}
