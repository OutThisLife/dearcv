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

/** The stub text a new document opens with, which nobody typed. */
const stockBasics = new Set(
  Object.values(blankResume().basics).filter((value) => typeof value === "string"),
);

/**
 * Whether there is anything of theirs in here yet. It decides whether the
 * preview draws this document or the PDF behind it, so the header has to
 * count: reading only the sections meant a name they had just changed left the
 * screen showing the old one, and the reply saying otherwise read as a lie.
 */
export function isEmptyResume(doc: ResumeDoc): boolean {
  const { links, ...text } = doc.basics;
  if (links.length > 0) return false;
  if (Object.values(text).some((value) => value?.trim() && !stockBasics.has(value))) return false;

  return doc.sections.every((section) => section.items.length === 0 && !section.lines?.length);
}

export function upsertById<T extends { id: string }>(list: T[], next: T): T[] {
  const i = list.findIndex((item) => item.id === next.id);
  if (i === -1) return [...list, next];
  return list.map((item, idx) => (idx === i ? next : item));
}
