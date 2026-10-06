"use client";

import { useAssistantTool, useAssistantToolUI, useAui } from "@assistant-ui/react";
import { useEffect } from "react";
import { z } from "zod";
import { toolLabel } from "@/components/assistant-ui/elements/tool-label";
import { artSchema, PAGE_SIZE } from "@/lib/resume/art";
import { anchorsOf, landing, partNames, settleArt } from "@/lib/resume/art-edit";
import { describeLayout, shootPages } from "@/lib/resume/look";
import { boxIds } from "@/lib/resume/pdf-boxes";
import {
  isEmptyResume,
  resumeBasicsSchema,
  resumeContentSchema,
  resumeItemSchema,
  resumeSectionSchema,
  resumeThemeSchema,
  type ResumeDoc,
} from "@/lib/resume/schema";
import { forModel } from "@/lib/prompts";
import { follow } from "@/lib/resume/ingest";
import { latestText } from "@/lib/resume/reading-head";
import { restyle } from "@/lib/resume/restyle";
import { withPictures } from "@/lib/tool-pictures";
import { useActivityStore } from "@/lib/store/activity";
import { type Ask, useHistoryStore } from "@/lib/store/history";
import { whenDrawn, useLayoutStore } from "@/lib/store/layout";
import { keepMade } from "@/lib/store/assets";
import { useMarksStore } from "@/lib/store/marks";
import { useResumeStore } from "@/lib/store/resume";
import { useThreadStore } from "@/lib/store/thread";

const sectionRef = z.object({
  sectionId: z.string().describe("Id of an existing section."),
});

const itemRef = sectionRef.extend({
  itemId: z.string().describe("Id of the item to remove."),
});

const before = z
  .string()
  .optional()
  .describe(
    "Id of the entry this goes ahead of. Leave out to keep an existing one where it is, or to add a new one last.",
  );

const itemPayload = sectionRef.extend({
  item: resumeItemSchema,
  before,
});

const sectionPayload = resumeSectionSchema.extend({ before });

/** The look the model may ask for. The measured typeset is not its to touch. */
const themePatch = resumeThemeSchema.omit({ typeset: true }).partial();

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
  /**
   * What it shows instead once the call says it made something new rather
   * than changed something there — "Added a role" for a job that was not on
   * the page, where "Updated a role" would say it rewrote one.
   */
  addedLabel?: string;
  detail?: (input: Streaming<z.infer<S>>) => string | undefined;
  /**
   * What the history calls this step, from the document as it was before —
   * which is the only place a removal still knows the name of what it removed,
   * and an upsert whether it was adding or replacing.
   */
  step?: (input: z.infer<S>, before: ResumeDoc) => string;
  /**
   * The part of the page it is working on, from arguments still streaming in,
   * so the preview can show it being worked on before the edit lands.
   */
  target?: (input: Streaming<z.infer<S>>, doc: ResumeDoc) => string | undefined;
  /**
   * The part of a call that copies the upload out, for one that writes a
   * whole resume: as it streams the reading head follows it down their page,
   * where otherwise there would only be a long wait.
   */
  copies?: (input: Streaming<z.infer<S>>) => unknown;
  /** May run while the upload is still uncarried. Reading and carrying only. */
  beforeCarry?: boolean;
};

// The stores are reached, never subscribed. Nothing here renders off them —
// a tool reads the document at the moment it runs, and a value captured any
// earlier would be a document the edit was not actually applied to.
const resume = () => useResumeStore.getState();

/**
 * Flash what the edit touched, so it is visible on the page and not only
 * claimed, and send the agent's cursor there.
 */
const mark = (id: string) => {
  useMarksStore.getState().mark(id);
  useActivityStore.getState().point(id);
};

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

const sectionOf = (doc: ResumeDoc, id: string) => doc.sections.find((section) => section.id === id);
const itemOf = (doc: ResumeDoc, sectionId: string, id: string) =>
  sectionOf(doc, sectionId)?.items.find((item) => item.id === id);

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
      if (!isEmptyResume(doc) || !sourceText.trim()) return { doc: forModel(doc) };

      return {
        doc: forModel(doc),
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
    target: () => boxIds.page,
    copies: (args) => args,
    run: (content) => {
      // A rebuild is content only: the look and the art on the page stay.
      resume().replaceContent({ ...content, theme: resume().doc.theme, art: resume().doc.art });
      // Everything moved, so the page is what changed.
      useMarksStore.getState().clearMarks();
      mark(boxIds.page);
      return { ok: true, name: content.basics.name };
    },
  }),
  defineTool({
    name: "update_basics",
    description: "Patch name, headline, contact, links, or summary.",
    parameters: resumeBasicsSchema.partial(),
    label: "Updated the header",
    target: () => boxIds.basics,
    run: (basics) => {
      resume().patchDoc({ basics: { ...resume().doc.basics, ...basics } });
      mark(boxIds.basics);
      return { ok: true };
    },
  }),
  defineTool({
    name: "update_theme",
    description:
      "Patch the look: header layout (centered / split / left / accent-bar / signature), typeface (sans / serif / mono), colors (accent, text, muted, background), density, page size, signature. Only when they ask — the look already matches the file they uploaded, and what you change lands on top of it.",
    parameters: themePatch,
    label: "Changed the look",
    target: () => boxIds.page,
    run: (theme) => {
      resume().patchDoc({ theme: restyle(resume().doc.theme, theme) });
      // A look lands on every line, so the whole page is what changed.
      mark(boxIds.page);
      return { ok: true };
    },
  }),
  defineTool({
    name: "upsert_section",
    description:
      "Add or replace a whole section by id. Replacing restates every item in it, so change only what they asked and keep the rest word for word.",
    parameters: sectionPayload,
    label: "Updated a section",
    addedLabel: "Added a section",
    detail: (args) => args.title,
    step: ({ id, title }, before) => `${sectionOf(before, id) ? "Updated" : "Added"} ${title}`,
    // A new section has no box yet; the one it goes ahead of is where it will appear.
    target: ({ id, before }, doc) =>
      id && sectionOf(doc, id) ? boxIds.section(id) : before ? boxIds.section(before) : boxIds.page,
    run: ({ before, ...section }) => {
      const added = !sectionOf(resume().doc, section.id);
      resume().upsertSection(section, before);
      mark(boxIds.section(section.id));
      return { ok: true, id: section.id, added };
    },
  }),
  defineTool({
    name: "remove_section",
    description: "Remove a section by id.",
    parameters: sectionId,
    label: "Removed a section",
    step: ({ id }, before) => `Removed ${sectionOf(before, id)?.title ?? "a section"}`,
    target: ({ id }) => (id ? boxIds.section(id) : undefined),
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
    addedLabel: "Added a role",
    detail: (args) => args.item?.org || args.item?.title,
    step: ({ sectionId, item }, before) =>
      `${itemOf(before, sectionId, item.id) ? "Updated" : "Added"} ${item.org || item.title}`,
    // A new role lands in its section, which is the box that will grow.
    target: ({ sectionId, item }, doc) =>
      sectionId && item?.id && itemOf(doc, sectionId, item.id)
        ? boxIds.item(item.id)
        : sectionId
          ? boxIds.section(sectionId)
          : undefined,
    run: ({ sectionId, item, before }) => {
      const added = !itemOf(resume().doc, sectionId, item.id);
      if (!resume().upsertItem(sectionId, item, before)) missing("section", sectionId);
      mark(boxIds.item(item.id));
      return { ok: true, sectionId, id: item.id, added };
    },
  }),
  defineTool({
    name: "remove_item",
    description: "Remove one item from a section.",
    parameters: itemRef,
    label: "Removed a role",
    step: ({ sectionId, itemId }, before) => {
      const item = itemOf(before, sectionId, itemId);
      return `Removed ${item ? item.org || item.title : "a role"}`;
    },
    target: ({ itemId }) => (itemId ? boxIds.item(itemId) : undefined),
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
  defineTool({
    name: "place_art",
    description:
      "Add or change art on the page — a drawing (svg), a picture (image), or hand-drawn pen or highlighter lines (strokes) — in a box of its own, behind the text or in front of it, on a page or pinned to a part of the resume. Send several pieces in one call. To change a piece, send its id and only what changes. Returns where each piece landed on the redrawn page and any text it now covers: check it, then look_at_page when the result matters.",
    parameters: z.object({
      pieces: z
        .array(artSchema.partial().required({ id: true }))
        .min(1)
        .describe(
          "New pieces need content (svg, image or strokes), x, y, width and height. Existing ones only what changes.",
        ),
    }),
    label: "Drew on the page",
    addedLabel: "Added art",
    detail: (args) =>
      args.pieces
        ?.map((piece) => piece?.label ?? piece?.id)
        .filter(Boolean)
        .join(", "),
    step: ({ pieces }, before) =>
      `${pieces.every((piece) => !before.art?.some((one) => one.id === piece.id)) ? "Added" : "Changed"} ${pieces
        .map(
          (piece) =>
            piece.label ?? before.art?.find((one) => one.id === piece.id)?.label ?? piece.id,
        )
        .join(", ")}`,
    target: ({ pieces }, doc) => {
      const first = pieces?.[0];
      if (!first?.id) return boxIds.page;
      if (doc.art?.some((piece) => piece.id === first.id)) return boxIds.art(first.id);
      return first.anchor && anchorsOf(doc).has(first.anchor) ? first.anchor : boxIds.page;
    },
    run: async ({ pieces }) => {
      const doc = resume().doc;
      const { art, added, notes } = await settleArt(pieces, doc, useThreadStore.getState().id);
      resume().patchDoc({ art });
      const now = resume().doc;
      pieces.forEach((piece) => mark(boxIds.art(piece.id)));
      const drawn = await whenDrawn(now);
      if (drawn.error) throw new Error(`The page couldn't be drawn with that art: ${drawn.error}`);
      return {
        ok: true,
        added: added.length > 0,
        placed: landing(
          pieces.map((piece) => piece.id),
          now,
          drawn.boxes,
          drawn.pages,
        ),
        ...(notes.length ? { notes } : {}),
      };
    },
  }),
  defineTool({
    name: "remove_art",
    description: "Take art off the page, by id.",
    parameters: z.object({ ids: z.array(z.string()).min(1) }),
    label: "Removed art",
    detail: (args) => args.ids?.join(", "),
    step: ({ ids }, before) =>
      `Removed ${ids.map((id) => before.art?.find((piece) => piece.id === id)?.label ?? id).join(", ")}`,
    target: ({ ids }) => (ids?.[0] ? boxIds.art(ids[0]) : undefined),
    run: ({ ids }) => {
      const art = resume().doc.art ?? [];
      const unknown = ids.filter((id) => !art.some((piece) => piece.id === id));
      if (unknown.length === ids.length) missing("art", unknown[0]!);
      resume().patchDoc({ art: art.filter((piece) => !ids.includes(piece.id)) });
      return { ok: true, removed: ids.filter((id) => !unknown.includes(id)) };
    },
  }),
  defineTool({
    name: "look_at_page",
    description:
      "See the resume exactly as it prints: a picture of each page, and every part's box in page points. Use it before placing art, to find space and line things up, and after, to check what you made — overlaps, balance, legibility — and fix what is off. grid rules a light 50pt grid with labelled edges, to read positions off.",
    parameters: z.object({
      pages: z
        .array(z.number().int().min(1))
        .optional()
        .describe("Which pages, from 1. All (up to 3) by default."),
      grid: z.boolean().optional(),
    }),
    beforeCarry: true,
    label: "Looked at the page",
    target: () => undefined,
    run: async ({ pages, grid }) => {
      const doc = resume().doc;
      const drawn = await whenDrawn(doc);
      if (!drawn.url) {
        throw new Error(
          drawn.error
            ? `The page couldn't be drawn: ${drawn.error}`
            : "Nothing is on the page yet.",
        );
      }
      const shots = await shootPages(drawn.url, { pages, grid });
      const size = PAGE_SIZE[doc.theme.page] ?? PAGE_SIZE.letter;
      const parts = describeLayout(drawn.boxes, partNames(doc));
      const summary = {
        page: { size: doc.theme.page, width: size.width, height: size.height, count: drawn.pages },
        parts,
      };
      return withPictures(
        summary,
        `The resume as it prints: ${drawn.pages} page${drawn.pages === 1 ? "" : "s"} of ${size.width}×${size.height}pt. Parts, in page points from each page's top-left:\n${JSON.stringify(summary)}`,
        shots.map((shot) => ({
          ...shot,
          caption: `Page ${shot.page}${grid ? " (50pt grid)" : ""}:`,
        })),
      );
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
 * Holds a call's place on the page for as long as it is running: mounted
 * while its arguments stream in and it executes, gone once it has an answer.
 * Following the target as it changes, since the id it points at is often
 * the last thing to arrive.
 */
function Working({ call, target, copying }: { call: string; target?: string; copying?: string }) {
  useEffect(() => {
    if (!target) return;
    const activity = useActivityStore.getState();
    activity.work(call, target);
    return () => activity.done(call);
  }, [call, target]);

  useEffect(() => follow(copying), [copying]);
  useEffect(() => () => useActivityStore.getState().readTo(null), []);

  return null;
}

/**
 * The latest message they sent, which every edit in the reply under way is
 * answering. Text only, on one line: it becomes the step's name in the
 * history, and an attachment-only message falls back to what was changed.
 */
function askOf(aui: ReturnType<typeof useAui>): Ask | undefined {
  const user = aui
    .thread()
    .getState()
    .messages.findLast((message) => message.role === "user");
  if (!user) return undefined;
  const text = user.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  // A comment said in the chat files its edits under the comment, so the
  // pin's own Undo can find them.
  const comment = user.metadata?.custom?.commentId;
  return { id: typeof comment === "string" ? comment : user.id, text };
}

/**
 * Any tool, with its schema erased. Each one keeps its real types where it is
 * declared, which is the only place they can catch anything; by the time it
 * reaches registration every tool is the same shape and pretending otherwise
 * only fights the library's own signature.
 */
type AnyTool = ToolSpec<z.ZodObject>;

/**
 * Runs a tool as one step of the history: the page before it can be returned
 * to, and the page after it is filed under the message it answers.
 */
/** Query parameters that say who sent a visit, not where it goes. */
const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref_src$)/;

/**
 * Every link in an edit, without the tracking a search tacked on. OpenAI's
 * search hands back every page as `…?utm_source=openai`, and a model that
 * looked a company up copied that straight onto the resume.
 */
function untracked<T>(value: T): T {
  if (typeof value === "string") {
    if (!/^https?:\/\//i.test(value)) return value;
    try {
      const url = new URL(value);
      // Collected first: deleting from the params while walking them skips one.
      const tracking = Array.from(url.searchParams.keys()).filter((key) => TRACKING.test(key));
      for (const key of tracking) url.searchParams.delete(key);
      const clean = url.toString();
      // Give back what was written, less the tracking — not a re-spelt URL
      // with a trailing slash it never had.
      return (
        value.endsWith("/") || url.pathname !== "/" || url.search ? clean : clean.replace(/\/$/, "")
      ) as T;
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(untracked) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, one]) => [key, untracked(one)]),
    ) as T;
  }
  return value;
}

async function applyEdit(spec: AnyTool, input: unknown, ask?: Ask) {
  const history = useHistoryStore.getState();
  history.begin();
  const before = resume().doc;
  input = untracked(input);
  // Awaited: placing art waits for the page to be redrawn, so it can say
  // where things actually landed.
  const result = await spec.run(input as never);
  history.record(spec.step?.(input as never, before) ?? spec.label, ask);
  return result;
}

/**
 * The same, for a call that does not come through the chat's own runtime: a
 * comment's agent, which runs alongside it, and the dev demo's scripted
 * conversation. Held to the same rules as the chat's — checked against the
 * tool's schema, refused until the upload is carried — so a call that drifts
 * fails loudly instead of half-applying.
 */
export async function runTool(name: string, input: unknown, ask?: Ask) {
  const spec = toolNamed(name);
  if (!spec.beforeCarry) needsCarry();
  return applyEdit(spec, spec.parameters.parse(input), ask);
}

/**
 * Where everything sits on the page as last drawn, for the model to place
 * art against without having to look first. One line per part, in points.
 */
export function layoutBrief() {
  const { boxes, pages, doc } = useLayoutStore.getState();
  if (!doc || !pages) return "";
  const size = PAGE_SIZE[doc.theme.page] ?? PAGE_SIZE.letter;
  const parts = describeLayout(boxes, partNames(doc));
  return [
    `Page: ${doc.theme.page}, ${size.width}×${size.height}pt, ${pages} page${pages === 1 ? "" : "s"}.`,
    ...parts.map(
      (part) =>
        `${part.id}${part.name ? ` (${part.name})` : ""}: page ${part.page}, x ${part.x}, y ${part.y}, ${part.width}×${part.height}`,
    ),
  ].join("\n");
}

const toolNamed = (name: string) => {
  const spec = TOOLS.find((tool) => tool.name === name) as AnyTool | undefined;
  if (!spec) throw new Error(`No tool named "${name}".`);
  return spec;
};

/** Every tool as the chat route takes them, for a conversation outside the chat's runtime. */
export const toolSchemas = () =>
  Object.fromEntries(
    TOOLS.map((tool) => [
      tool.name,
      { description: tool.description, parameters: z.toJSONSchema(tool.parameters) },
    ]),
  );

/** Where a call is working, from its arguments so far — for a call from outside the chat's runtime. */
export const toolTarget = (name: string, args: unknown) =>
  TOOLS.find((tool) => tool.name === name)?.target?.((args ?? {}) as never, resume().doc);

/** What a whole-resume call has copied out so far, for the reading head. */
export const toolCopying = (name: string, args: unknown) => {
  const spec = TOOLS.find((tool) => tool.name === name) as AnyTool | undefined;
  return spec?.copies ? latestText(spec.copies((args ?? {}) as never)) : undefined;
};

/**
 * A call as a transcript shows it, for a thread outside the chat: ours in
 * the words the chat uses for them, the rest as the chat names them.
 */
/** A call's label, from what it reported doing once it has. */
const labelOf = (spec: AnyTool, result: unknown) =>
  spec.addedLabel && (result as { added?: unknown } | undefined)?.added === true
    ? spec.addedLabel
    : spec.label;

export const callText = (name: string, args: unknown, result?: unknown) => {
  const spec = TOOLS.find((tool) => tool.name === name) as AnyTool | undefined;
  if (!spec) return toolLabel(name, args);
  const detail = spec.detail?.((args ?? {}) as never);
  const label = labelOf(spec, result);
  return detail ? `${label} · ${detail}` : label;
};

export function CallNote({
  name,
  args,
  result,
}: {
  name: string;
  args: unknown;
  result?: unknown;
}) {
  const spec = TOOLS.find((tool) => tool.name === name) as AnyTool | undefined;
  if (!spec) return <ToolNote label={toolLabel(name, args)} />;
  return <ToolNote label={labelOf(spec, result)} detail={spec.detail?.((args ?? {}) as never)} />;
}

/**
 * One registration. Hooks cannot be called in a loop over a list, but a
 * component can be rendered from one, which is what keeps adding a tool to a
 * single entry in the array above instead of an entry plus a hook call that is
 * easy to forget.
 */
function Tool({ spec }: { spec: AnyTool }) {
  const aui = useAui();
  useAssistantTool({
    toolName: spec.name,
    type: "frontend",
    description: spec.description,
    parameters: spec.parameters,
    execute: async (input) => {
      if (!spec.beforeCarry) needsCarry();
      return applyEdit(spec, input, askOf(aui));
    },
    render: ({ args, result, status, toolCallId }) => (
      <>
        <ToolNote label={labelOf(spec, result)} detail={spec.detail?.(args)} />
        {status.type === "running" ? (
          <Working
            call={toolCallId}
            target={spec.target?.(args, resume().doc)}
            copying={spec.copies ? latestText(spec.copies(args)) : undefined}
          />
        ) : null}
      </>
    ),
  });

  return null;
}

export function ResumeTools() {
  return (
    <>
      {TOOLS.map((spec) => (
        <Tool key={spec.name} spec={spec as AnyTool} />
      ))}
      <PictureTools />
    </>
  );
}

/**
 * The two picture tools that run on the server, as the transcript shows them.
 * A made picture's bytes arrive once, in its result, and are kept here the
 * moment they do — under the id the model was handed, so its next call can
 * place it.
 */
function PictureTools() {
  useAssistantToolUI({
    toolName: "find_images",
    render: ({ args }) => (
      <ToolNote label="Looked for pictures" detail={(args as { query?: string })?.query} />
    ),
  });
  useAssistantToolUI({
    toolName: "generate_image",
    render: ({ result, status }) => (
      <MadePicture result={result} running={status.type === "running"} />
    ),
  });
  return null;
}

function MadePicture({ result, running }: { result: unknown; running: boolean }) {
  useEffect(() => keepMade(result, useThreadStore.getState().id), [result]);
  const failed = (result as { ok?: boolean } | undefined)?.ok === false;
  return (
    <ToolNote
      label={running ? "Painting a picture" : failed ? "Couldn't paint that" : "Painted a picture"}
    />
  );
}
