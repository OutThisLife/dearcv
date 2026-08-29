import { z } from "zod";

/**
 * Ten times a heavy resume. Shared so the browser can turn an oversized file
 * away before it travels, rather than finding out from the upload endpoint.
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export const resumeLinkSchema = z.object({
  label: z.string(),
  href: z.string(),
});

export const resumeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  org: z.string().optional(),
  href: z.string().optional(),
  location: z.string().optional(),
  start: z.string().optional(),
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
  header: z.enum(["centered", "split", "accent-bar", "signature"]),
  accent: z.string(),
  text: z.string(),
  muted: z.string(),
  background: z.string(),
  density: z.enum(["compact", "normal", "airy"]),
  page: z.enum(["letter", "a4"]),
  showSignature: z.boolean(),
  signature: z.string().optional(),
});

export const resumeBasicsSchema = z.object({
  name: z.string(),
  headline: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(resumeLinkSchema),
  summary: z.string().optional(),
});

export const resumeDocSchema = z.object({
  basics: resumeBasicsSchema,
  theme: resumeThemeSchema,
  sections: z.array(resumeSectionSchema),
});

export type ResumeLink = z.infer<typeof resumeLinkSchema>;
export type ResumeItem = z.infer<typeof resumeItemSchema>;
export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type ResumeTheme = z.infer<typeof resumeThemeSchema>;
export type ResumeBasics = z.infer<typeof resumeBasicsSchema>;
export type ResumeDoc = z.infer<typeof resumeDocSchema>;

export const defaultTheme = (): ResumeTheme => ({
  header: "split",
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

export function upsertById<T extends { id: string }>(list: T[], next: T): T[] {
  const i = list.findIndex((item) => item.id === next.id);
  if (i === -1) return [...list, next];
  return list.map((item, idx) => (idx === i ? next : item));
}
