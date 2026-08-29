"use client";

import { DownloadIcon, Trash2Icon } from "lucide-react";
import { ResumePreview } from "@/components/resume-preview";
import { Button } from "@/components/ui/button";
import { useResumeStore } from "@/lib/store/resume";

export function ResumePane() {
  const touched = useResumeStore((s) => s.touched);
  const sourceName = useResumeStore((s) => s.sourceName);
  const originalUrl = useResumeStore((s) => s.originalUrl);
  const previewUrl = useResumeStore((s) => s.previewUrl);
  const error = useResumeStore((s) => s.error);
  const setError = useResumeStore((s) => s.setError);
  const resetBlank = useResumeStore((s) => s.resetBlank);

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
        <div className="flex items-center gap-1">
          {saveUrl ? (
            <Button variant="ghost" size="sm" onClick={resetBlank}>
              <Trash2Icon data-icon="inline-start" />
              Start over
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={!saveUrl}
            onClick={() => {
              if (!saveUrl) return;
              // Read at the click rather than subscribed: the name is wanted
              // once, and holding the whole document for it would redraw this
              // header on every keystroke the model makes.
              const { name } = useResumeStore.getState().doc.basics;
              const a = document.createElement("a");
              a.href = saveUrl;
              a.download = `${name.replace(/\s+/g, "-")}-resume.pdf`;
              a.click();
            }}
          >
            <DownloadIcon data-icon="inline-start" />
            Save
          </Button>
        </div>
      </header>

      <ResumePreview />
    </>
  );
}
