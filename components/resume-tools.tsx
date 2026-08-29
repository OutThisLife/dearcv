"use client";

import { useAssistantTool } from "@assistant-ui/react";
import { useMemo } from "react";
import { z } from "zod";
import { boxIds } from "@/lib/resume/pdf-boxes";
import {
  isEmptyResume,
  resumeBasicsSchema,
  resumeDocSchema,
  resumeItemSchema,
  resumeSectionSchema,
  resumeThemeSchema,
} from "@/lib/resume/schema";
import { useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";

const sectionRef = z.object({
  sectionId: z.string().describe("Id of an existing section."),
});

const itemRef = sectionRef.extend({
  itemId: z.string().describe("Id of the item to remove."),
});

const itemPayload = sectionRef.extend({
  item: resumeItemSchema,
});

const sectionId = z.object({
  id: z.string().describe("Id of an existing section."),
});

function ToolNote({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="text-muted-foreground py-0.5 font-sans text-xs opacity-65">
      {label}
      {detail ? <span className="text-foreground/80"> · {detail}</span> : null}
    </div>
  );
}

export function ResumeTools() {
  const tools = useMemo(() => {
    const store = () => useResumeStore.getState();
    // Outline what the edit touched so it is visible on the page rather than
    // only claimed in the transcript.
    const mark = (id: string) => useMarksStore.getState().mark(id);
    // Throwing reaches the model as a tool error, so a bad id gets corrected
    // on the next step instead of being reported as a successful edit.
    const missing = (what: string, id: string) => {
      throw new Error(`No ${what} with id "${id}". Call get_resume for the real ids.`);
    };
    // Until the upload has been carried across, the live document is a stub and
    // the screen is still showing the PDF. A narrow edit onto that stub really
    // does apply, and really does change nothing anyone can see — so the reply
    // says the name was changed while the page keeps the old one, and the
    // honest reading from the other side of it is that the model made the edit
    // up. Refusing here is what makes update_resume come first, rather than
    // hoping the instructions are followed.
    const needsCarry = () => {
      const { doc, sourceText } = store();
      if (!isEmptyResume(doc) || !sourceText.trim()) return;
      throw new Error(
        "The live document is still empty and their resume is the uploaded PDF already in your instructions. Carry it across in full with update_resume, then make this change.",
      );
    };

    return {
      get_resume: {
        toolName: "get_resume",
        type: "frontend" as const,
        description:
          "Read the live resume document, and whether an uploaded PDF is still waiting to become one.",
        parameters: z.object({}),
        // A blank document is not the same as nothing to work from. Without
        // the upload alongside it, this reads as "they have no resume" while
        // their resume is sitting in the instructions, unparsed.
        execute: async () => {
          const { doc, sourceName, sourceText } = store();
          if (!isEmptyResume(doc) || !sourceText.trim()) return { doc };
          return {
            doc,
            upload: {
              name: sourceName,
              note: "Their resume is already in your instructions in full. Answer from it, and carry it across with update_resume when they ask for a change.",
            },
          };
        },
        render: () => <ToolNote label="Read resume" />,
      },
      update_resume: {
        toolName: "update_resume",
        type: "frontend" as const,
        description:
          "Replace all resume content (basics + sections). Theme is kept unless the document is empty.",
        parameters: resumeDocSchema,
        execute: async (resume: z.infer<typeof resumeDocSchema>) => {
          store().replaceContent(resume);
          // Everything moved. Outlining all of it says nothing.
          useMarksStore.getState().clearMarks();
          return { ok: true, name: resume.basics.name };
        },
        render: ({ args }: { args: { basics?: { name?: string } } }) => (
          <ToolNote label="Updated the resume" detail={args.basics?.name} />
        ),
      },
      update_basics: {
        toolName: "update_basics",
        type: "frontend" as const,
        description: "Patch name, headline, contact, links, or summary.",
        parameters: resumeBasicsSchema.partial(),
        execute: async (basics: Partial<z.infer<typeof resumeBasicsSchema>>) => {
          needsCarry();
          store().patchDoc({ basics: { ...store().doc.basics, ...basics } });
          mark(boxIds.basics);
          return { ok: true };
        },
        render: () => <ToolNote label="Updated the header" />,
      },
      update_theme: {
        toolName: "update_theme",
        type: "frontend" as const,
        description:
          "Patch the look: header layout (centered / split / accent-bar / signature), colors (accent, text, muted, background), density, page size, signature.",
        parameters: resumeThemeSchema.partial(),
        execute: async (theme: Partial<z.infer<typeof resumeThemeSchema>>) => {
          needsCarry();
          store().patchDoc({ theme: { ...store().doc.theme, ...theme } });
          // Colors and density land page-wide, but a header change is local
          // enough to point at — and it is the one people notice too late.
          if ("header" in theme || "signature" in theme || "showSignature" in theme) {
            mark(boxIds.basics);
          }
          return { ok: true };
        },
        render: () => <ToolNote label="Changed the look" />,
      },
      upsert_section: {
        toolName: "upsert_section",
        type: "frontend" as const,
        description: "Add or replace a whole section by id.",
        parameters: resumeSectionSchema,
        execute: async (section: z.infer<typeof resumeSectionSchema>) => {
          needsCarry();
          store().upsertSection(section);
          mark(boxIds.section(section.id));
          return { ok: true, id: section.id };
        },
        render: ({ args }: { args: { title?: string } }) => (
          <ToolNote label="Updated a section" detail={args.title} />
        ),
      },
      remove_section: {
        toolName: "remove_section",
        type: "frontend" as const,
        description: "Remove a section by id.",
        parameters: sectionId,
        execute: async ({ id }: z.infer<typeof sectionId>) => {
          if (!store().removeSection(id)) missing("section", id);
          return { ok: true, id };
        },
        render: () => <ToolNote label="Removed a section" />,
      },
      upsert_item: {
        toolName: "upsert_item",
        type: "frontend" as const,
        description: "Add or replace one item (a job, project, degree) inside an existing section.",
        parameters: itemPayload,
        execute: async ({ sectionId, item }: z.infer<typeof itemPayload>) => {
          needsCarry();
          if (!store().upsertItem(sectionId, item)) missing("section", sectionId);
          mark(boxIds.item(item.id));
          return { ok: true, sectionId, id: item.id };
        },
        render: ({ args }: { args: { item?: { title?: string } } }) => (
          <ToolNote label="Updated a role" detail={args.item?.title} />
        ),
      },
      remove_item: {
        toolName: "remove_item",
        type: "frontend" as const,
        description: "Remove one item from a section.",
        parameters: itemRef,
        execute: async ({ sectionId, itemId }: z.infer<typeof itemRef>) => {
          // A wrong section id fails the same way a wrong item id does, and
          // being told the item is missing sends the model hunting in the
          // wrong place.
          if (!store().doc.sections.some((section) => section.id === sectionId)) {
            missing("section", sectionId);
          }
          if (!store().removeItem(sectionId, itemId)) missing("item", itemId);
          // The item is gone, so point at the gap it left.
          mark(boxIds.section(sectionId));
          return { ok: true, sectionId, itemId };
        },
        render: () => <ToolNote label="Removed a role" />,
      },
    };
  }, []);

  useAssistantTool(tools.get_resume);
  useAssistantTool(tools.update_resume);
  useAssistantTool(tools.update_basics);
  useAssistantTool(tools.update_theme);
  useAssistantTool(tools.upsert_section);
  useAssistantTool(tools.remove_section);
  useAssistantTool(tools.upsert_item);
  useAssistantTool(tools.remove_item);

  return null;
}
