"use client";

import { useAssistantTool } from "@assistant-ui/react";
import { z } from "zod";
import { boxIds } from "@/lib/resume/pdf-boxes";
import {
  isEmptyResume,
  resumeBasicsSchema,
  resumeContentSchema,
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

/**
 * A call still arriving. Arguments stream in a field at a time, so the label a
 * tool draws while it runs has to cope with any of them missing — which the
 * hand-written shapes this replaces only remembered to do one level deep.
 */
type Streaming<T> = T extends (infer U)[]
  ? Streaming<U>[]
  : T extends object
    ? { [K in keyof T]?: Streaming<T[K]> }
    : T;

type ToolSpec<S extends z.ZodObject> = {
  name: string;
  description: string;
  parameters: S;
  /** Does the work and answers the model. Throwing is how it says no. */
  run: (input: z.infer<S>) => unknown;
  /** What the transcript shows, and optionally what it was about. */
  label: string;
  detail?: (input: Streaming<z.infer<S>>) => string | undefined;
  /** May run while the upload is still uncarried. Reading and carrying only. */
  beforeCarry?: boolean;
};

// The stores are reached, never subscribed. Nothing here renders off them —
// a tool reads the document at the moment it runs, and a value captured any
// earlier would be a document the edit was not actually applied to.
const resume = () => useResumeStore.getState();

/** Outline what the edit touched, so it is visible on the page and not only claimed. */
const mark = (id: string) => useMarksStore.getState().mark(id);

/**
 * Throwing reaches the model as a tool error, so a bad id gets corrected on the
 * next step instead of being reported as a successful edit.
 */
const missing = (what: string, id: string): never => {
  throw new Error(`No ${what} with id "${id}". Call get_resume for the real ids.`);
};

/**
 * Until the upload has been carried across, the live document is a stub and the
 * screen is still showing the PDF. A narrow edit onto that stub really does
 * apply, and really does change nothing anyone can see — so the reply says the
 * name was changed while the page keeps the old one, and the honest reading
 * from the other side of it is that the model made the edit up. Refusing here
 * is what makes update_resume come first, rather than hoping the instructions
 * are followed.
 */
const needsCarry = () => {
  const { doc, sourceText } = resume();
  if (!isEmptyResume(doc) || !sourceText.trim()) return;

  throw new Error(
    "The live document is still empty and their resume is the uploaded PDF already in your instructions. Carry it across in full with update_resume, then make this change.",
  );
};

/** Only for inference — every tool is declared through this so the shapes line up. */
const defineTool = <S extends z.ZodObject>(spec: ToolSpec<S>) => spec;

const TOOLS = [
  defineTool({
    name: "get_resume",
    description:
      "Read the live resume document, and whether an uploaded PDF is still waiting to become one.",
    parameters: z.object({}),
    beforeCarry: true,
    label: "Read resume",
    // A blank document is not the same as nothing to work from. Without the
    // upload alongside it, this reads as "they have no resume" while their
    // resume is sitting in the instructions, unparsed.
    run: () => {
      const { doc, sourceName, sourceText } = resume();
      if (!isEmptyResume(doc) || !sourceText.trim()) return { doc };

      return {
        doc,
        upload: {
          name: sourceName,
          note: "Their resume is already in your instructions in full. Answer from it, and carry it across with update_resume when they ask for a change.",
        },
      };
    },
  }),
  defineTool({
    name: "update_resume",
    description:
      "Replace all resume content (basics + sections). The look is measured off their file and never changes here — use update_theme for that.",
    parameters: resumeContentSchema,
    beforeCarry: true,
    label: "Updated the resume",
    detail: (args) => args.basics?.name,
    run: (content) => {
      resume().replaceContent({ ...content, theme: resume().doc.theme });
      // Everything moved. Outlining all of it says nothing.
      useMarksStore.getState().clearMarks();
      return { ok: true, name: content.basics.name };
    },
  }),
  defineTool({
    name: "update_basics",
    description: "Patch name, headline, contact, links, or summary.",
    parameters: resumeBasicsSchema.partial(),
    label: "Updated the header",
    run: (basics) => {
      resume().patchDoc({ basics: { ...resume().doc.basics, ...basics } });
      mark(boxIds.basics);
      return { ok: true };
    },
  }),
  defineTool({
    name: "update_theme",
    description:
      "Patch the look: header layout (centered / split / accent-bar / signature), typeface (sans / serif / mono), colors (accent, text, muted, background), density, page size, signature. Only when they ask — the look already matches the file they uploaded.",
    parameters: resumeThemeSchema.partial(),
    label: "Changed the look",
    run: (theme) => {
      resume().patchDoc({ theme: { ...resume().doc.theme, ...theme } });
      // Colors and density land page-wide, but a header change is local enough
      // to point at — and it is the one people notice too late.
      if ("header" in theme || "signature" in theme || "showSignature" in theme) {
        mark(boxIds.basics);
      }
      return { ok: true };
    },
  }),
  defineTool({
    name: "upsert_section",
    description: "Add or replace a whole section by id.",
    parameters: resumeSectionSchema,
    label: "Updated a section",
    detail: (args) => args.title,
    run: (section) => {
      resume().upsertSection(section);
      mark(boxIds.section(section.id));
      return { ok: true, id: section.id };
    },
  }),
  defineTool({
    name: "remove_section",
    description: "Remove a section by id.",
    parameters: sectionId,
    label: "Removed a section",
    run: ({ id }) => {
      if (!resume().removeSection(id)) missing("section", id);
      return { ok: true, id };
    },
  }),
  defineTool({
    name: "upsert_item",
    description: "Add or replace one item (a job, project, degree) inside an existing section.",
    parameters: itemPayload,
    label: "Updated a role",
    detail: (args) => args.item?.title,
    run: ({ sectionId, item }) => {
      if (!resume().upsertItem(sectionId, item)) missing("section", sectionId);
      mark(boxIds.item(item.id));
      return { ok: true, sectionId, id: item.id };
    },
  }),
  defineTool({
    name: "remove_item",
    description: "Remove one item from a section.",
    parameters: itemRef,
    label: "Removed a role",
    run: ({ sectionId, itemId }) => {
      // A wrong section id fails the same way a wrong item id does, and being
      // told the item is missing sends the model hunting in the wrong place.
      if (!resume().doc.sections.some((section) => section.id === sectionId)) {
        missing("section", sectionId);
      }
      if (!resume().removeItem(sectionId, itemId)) missing("item", itemId);
      // The item is gone, so point at the gap it left.
      mark(boxIds.section(sectionId));
      return { ok: true, sectionId, itemId };
    },
  }),
] as const;

function ToolNote({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="text-muted-foreground py-0.5 font-sans text-xs opacity-65">
      {label}
      {detail ? <span className="text-foreground/80"> · {detail}</span> : null}
    </div>
  );
}

/**
 * Any tool, with its schema erased. Each one keeps its real types where it is
 * declared, which is the only place they can catch anything; by the time it
 * reaches registration every tool is the same shape and pretending otherwise
 * only fights the library's own signature.
 */
type AnyTool = ToolSpec<z.ZodObject>;

/**
 * One registration. Hooks cannot be called in a loop over a list, but a
 * component can be rendered from one, which is what keeps adding a tool to a
 * single entry in the array above instead of an entry plus a hook call that is
 * easy to forget.
 */
function Tool({ spec }: { spec: AnyTool }) {
  useAssistantTool({
    toolName: spec.name,
    type: "frontend",
    description: spec.description,
    parameters: spec.parameters,
    execute: async (input) => {
      if (!spec.beforeCarry) needsCarry();
      return spec.run(input);
    },
    render: ({ args }) => <ToolNote label={spec.label} detail={spec.detail?.(args)} />,
  });

  return null;
}

export function ResumeTools() {
  return (
    <>
      {TOOLS.map((spec) => (
        <Tool key={spec.name} spec={spec as AnyTool} />
      ))}
    </>
  );
}
