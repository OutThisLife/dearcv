"use client";

import { DownloadIcon, Trash2Icon } from "lucide-react";
import { ResumePreview } from "@/components/resume-preview";
import { Button } from "@/components/ui/button";
import { isEmptyResume } from "@/lib/resume/schema";
import { useResumeStore } from "@/lib/store/resume";

export function ResumePane() {
  const doc = useResumeStore((s) => s.doc);
  const sourceName = useResumeStore((s) => s.sourceName);
  const originalUrl = useResumeStore((s) => s.originalUrl);
  const previewUrl = useResumeStore((s) => s.previewUrl);
  const resetBlank = useResumeStore((s) => s.resetBlank);

  const saveUrl = isEmptyResume(doc) ? originalUrl : previewUrl;

  return (
    <section className="bg-background flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-4">
        <p className="text-muted-foreground min-w-0 truncate text-xs">
          {sourceName || "Your resume"}
        </p>
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
              const a = document.createElement("a");
              a.href = saveUrl;
              a.download = `${doc.basics.name.replace(/\s+/g, "-")}-resume.pdf`;
              a.click();
            }}
          >
            <DownloadIcon data-icon="inline-start" />
            Save
          </Button>
        </div>
      </header>

      <ResumePreview />
    </section>
  );
}
