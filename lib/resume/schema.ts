import { z } from "zod";
import { typesetSchema } from "./typeset";

/**
 * Ten times a heavy resume. Shared so the browser can turn an oversized file
 * away before it travels, rather than finding out from the upload endpoint.
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export const resumeLinkSchema = z.object({
  label: z
    .string()
    .describe(
      "The visible text, exactly as the resume prints it — if it shows github.com/handle, the label is github.com/handle, not 'GitHub'.",
    ),
  href: z.string().describe("Where the label points."),
});

export const resumeItemSchema = z.object({
  id: z.string(),
  title: z
    .string()
    .describe(
      "The role or position. For an entry with no role — just a company and dates — the company name goes here instead.",
    ),
  org: z
    .string()
    .optional()
    .describe(
      "The company or school name in words, e.g. 'BrainTrust'. Never a domain — the domain renders from href on its own.",
    ),
  href: z
    .string()
    .optional()
    .describe("The company's URL. Renders as its bare domain after the name."),
  location: z.string().optional(),
  start: z.string().optional().describe("As printed — do not reformat dates."),
  end: z.string().optional(),
  bullets: z.array(z.string()),
});

export const resumeSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["experience", "education", "projects", "skills", "list", "custom"]),
  items: z.array(resumeItemSchema),
  lines: z.array(z.string()).optional(),
});

export const resumeThemeSchema = z.object({
  header: z.enum(["centered", "split", "left", "accent-bar", "signature"]),
  /** The three the PDF format guarantees, so no file has to be fetched. */
  font: z.enum(["sans", "serif", "mono"]).default("sans"),
  accent: z.string(),
  text: z.string(),
  muted: z.string(),
  background: z.string(),
  density: z.enum(["compact", "normal", "airy"]),
  /** Type sizes and page margin in points, measured off the uploaded file. */
  metrics: z
    .object({
      name: z.number(),
      body: z.number(),
      section: z.number(),
      page: z.number(),
    })
    .optional()
    .describe(
      "Type sizes and page margin in points, measured off the uploaded file. Leave alone unless they ask for bigger or smaller type.",
    ),
  page: z.enum(["letter", "a4"]),
  showSignature: z.boolean(),
  signature: z.string().optional(),
  /** How the uploaded file was set, measured off its pages. See typeset.ts. */
  // A stored document from before a change to its shape loses only the
  // measured look, and falls back to the presets, rather than failing whole.
  typeset: typesetSchema.optional().catch(undefined),
});

export const resumeBasicsSchema = z.object({
  name: z.string(),
  headline: z
    .string()
    .optional()
    .describe(
      "The one-liner under the name, only if the resume actually has one. Never write one for them.",
    ),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(resumeLinkSchema),
  summary: z.string().optional(),
});

/**
 * Everything a rewrite is allowed to touch. The look is measured off the
 * uploaded file, so asking the model to restate it on every rewrite only gave
 * it a chance to get it wrong.
 */
export const resumeContentSchema = z.object({
  basics: resumeBasicsSchema,
  sections: z.array(resumeSectionSchema),
});

export const resumeDocSchema = resumeContentSchema.extend({
  theme: resumeThemeSchema,
});

export type ResumeLink = z.infer<typeof resumeLinkSchema>;
export type ResumeItem = z.infer<typeof resumeItemSchema>;
export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type ResumeTheme = z.infer<typeof resumeThemeSchema>;
export type ResumeBasics = z.infer<typeof resumeBasicsSchema>;
export type ResumeContent = z.infer<typeof resumeContentSchema>;
export type ResumeDoc = z.infer<typeof resumeDocSchema>;

export const defaultTheme = (): ResumeTheme => ({
  header: "split",
  font: "sans",
  accent: "#1f4e5f",
  text: "#171717",
  muted: "#5c5c5c",
  background: "#ffffff",
  density: "normal",
  page: "letter",
  showSignature: false,
});

export const blankResume = (): ResumeDoc => ({
  basics: {
    name: "Your Name",
    headline: "Role · Specialty",
    email: "you@email.com",
    links: [],
  },
  theme: defaultTheme(),
  sections: [
    {
      id: "experience",
      title: "Experience",
      kind: "experience",
      items: [],
    },
    {
      id: "education",
      title: "Education",
      kind: "education",
      items: [],
    },
    {
      id: "skills",
      title: "Skills",
      kind: "skills",
      items: [],
      lines: [],
    },
  ],
});

/**
 * What an upload starts from: nothing at all, rather than the scaffold a
 * from-scratch page shows. The scaffold's empty Experience, Education and
 * Skills used to ride into the model's view of the document and come back out
 * as sections the resume never had.
 */
export const uploadStub = (theme: ResumeTheme): ResumeDoc => ({
  basics: { name: "", links: [] },
  theme,
  sections: [],
});

/**
 * Whether this document has anything worth drawing yet. A header on its own
 * does not count, deliberately: with an upload behind it the PDF is the better
 * picture of the same person, and a page holding nothing but a name reads as
 * the resume having been thrown away.
 *
 * That leaves a document that has been touched but not filled in looking
 * untouched, which is only safe because a narrow edit can no longer land on
 * one — the editing tools refuse until the upload has been carried across.
 */
export function isEmptyResume(doc: ResumeDoc): boolean {
  if (doc.basics.summary?.trim()) return false;
  return doc.sections.every((section) => section.items.length === 0 && !section.lines?.length);
}

/**
 * Replaces in place, or inserts. `before` places a new entry ahead of the one
 * with that id — a new job goes above the last one, not under the oldest —
 * and moves an existing one there; without it, a new entry goes last.
 */
export function upsertById<T extends { id: string }>(list: T[], next: T, before?: string): T[] {
  const i = list.findIndex((item) => item.id === next.id);
  const anchor = before ? list.findIndex((item) => item.id === before) : -1;
  if (anchor === -1 || before === next.id) {
    if (i === -1) return [...list, next];
    return list.map((item, idx) => (idx === i ? next : item));
  }
  const rest = list.filter((item) => item.id !== next.id);
  const at = rest.findIndex((item) => item.id === before);
  return [...rest.slice(0, at), next, ...rest.slice(at)];
}
