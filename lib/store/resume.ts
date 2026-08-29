import { create } from "zustand";
import {
  blankResume,
  isEmptyResume,
  type ResumeContent,
  type ResumeDoc,
  type ResumeItem,
  type ResumeSection,
  type ResumeTheme,
  upsertById,
} from "@/lib/resume/schema";

type ResumeState = {
  doc: ResumeDoc;
  /**
   * Whether anything has actually been changed since upload. The background
   * transcription populates the document without setting this, so the preview
   * keeps showing their real PDF until an edit gives it a reason not to.
   */
  touched: boolean;
  sourceText: string;
  sourceName: string;
  /** The upload itself, held until the thread is worth storing it against. */
  file: File | null;
  originalUrl: string | null;
  /** Where the upload sits in the bucket, as opposed to the local blob: URL.
   *  Not a URL of its own: the bucket is private, so it is read through a
   *  route that signs a link after checking whose thread it is. */
  pdfPath: string | null;
  previewUrl: string | null;
  ingesting: boolean;
  /** Something went wrong with the file itself, in words for the person. */
  error: string | null;
  setError: (error: string | null) => void;
  setPdfPath: (path: string | null) => void;
  /** The background transcription landing — only onto a still-blank document. */
  adoptContent: (content: ResumeContent, forSource: string) => void;
  replaceContent: (doc: ResumeDoc) => void;
  patchDoc: (patch: Partial<ResumeDoc>) => void;
  upsertSection: (section: ResumeSection) => void;
  removeSection: (id: string) => boolean;
  upsertItem: (sectionId: string, item: ResumeItem) => boolean;
  removeItem: (sectionId: string, itemId: string) => boolean;
  setSource: (file: File, text: string, look?: Partial<ResumeTheme>) => void;
  setOriginalUrl: (url: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  setIngesting: (ingesting: boolean) => void;
  resetBlank: () => void;
};

const hasSection = (doc: ResumeDoc, id: string) =>
  doc.sections.some((section) => section.id === id);

export const useResumeStore = create<ResumeState>()((set, get) => ({
  doc: blankResume(),
  touched: false,
  sourceText: "",
  sourceName: "",
  file: null,
  originalUrl: null,
  pdfPath: null,
  previewUrl: null,
  ingesting: false,
  error: null,
  setPdfPath: (pdfPath) => set({ pdfPath }),
  // Guarded twice: the document must still be blank — the model may have
  // carried it across itself while this was in flight, and its version has the
  // user's first edit in it — and the transcription must be of the file that
  // is still on screen, not one they replaced while it ran.
  adoptContent: (content, forSource) =>
    set((state) =>
      isEmptyResume(state.doc) && state.sourceText === forSource
        ? { doc: { ...state.doc, ...content } }
        : {},
    ),
  // Content rebuilds never touch the look. The upload's own look is measured
  // at ingest, so the first rebuild onto a blank document used to be exactly
  // where it got thrown away and replaced with the model's guess.
  replaceContent: (doc) =>
    set((state) => ({ doc: { ...doc, theme: state.doc.theme }, touched: true })),
  patchDoc: (patch) =>
    set((state) => ({
      doc: { ...state.doc, ...patch },
      // A restyle of a blank document has nothing to show yet, so it alone
      // does not take the original off the screen.
      touched: state.touched || !isEmptyResume(state.doc),
    })),
  upsertSection: (section) =>
    set((state) => ({
      doc: {
        ...state.doc,
        sections: upsertById(state.doc.sections, section),
      },
      touched: true,
    })),
  removeSection: (id) => {
    if (!hasSection(get().doc, id)) return false;
    set((state) => ({
      doc: {
        ...state.doc,
        sections: state.doc.sections.filter((section) => section.id !== id),
      },
      touched: true,
    }));
    return true;
  },
  upsertItem: (sectionId, item) => {
    if (!hasSection(get().doc, sectionId)) return false;
    set((state) => ({
      doc: {
        ...state.doc,
        sections: state.doc.sections.map((section) =>
          section.id === sectionId
            ? { ...section, items: upsertById(section.items, item) }
            : section,
        ),
      },
      touched: true,
    }));
    return true;
  },
  removeItem: (sectionId, itemId) => {
    const section = get().doc.sections.find((one) => one.id === sectionId);
    if (!section?.items.some((item) => item.id === itemId)) return false;
    set((state) => ({
      doc: {
        ...state.doc,
        sections: state.doc.sections.map((one) =>
          one.id === sectionId
            ? { ...one, items: one.items.filter((item) => item.id !== itemId) }
            : one,
        ),
      },
      touched: true,
    }));
    return true;
  },
  setSource: (file, text, look) =>
    set((state) => ({
      file,
      sourceName: file.name,
      sourceText: text,
      // Whatever is in storage belongs to the PDF they just replaced, so it
      // stops standing for this one and the new file gets uploaded in its turn.
      pdfPath: null,
      // How the upload looked, measured off the page. It lands before the
      // model has said anything, so the first rebuild already matches.
      doc: { ...state.doc, theme: { ...state.doc.theme, ...look } },
    })),
  setOriginalUrl: (originalUrl) => set({ originalUrl }),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  setIngesting: (ingesting) => set({ ingesting }),
  setError: (error) => set({ error }),
  resetBlank: () => {
    const { originalUrl } = get();
    if (originalUrl?.startsWith("blob:")) URL.revokeObjectURL(originalUrl);
    set({
      doc: blankResume(),
      touched: false,
      sourceText: "",
      sourceName: "",
      file: null,
      originalUrl: null,
      pdfPath: null,
      error: null,
    });
  },
}));

export type SeededResume = {
  /** Absent for a new thread, which is given its id in the browser. */
  id?: string;
  doc?: ResumeDoc | null;
  sourceText?: string;
  sourceName?: string;
  pdfPath?: string | null;
};

/** A private file is read through the thread that owns it, never directly. */
export const storedPdfUrl = (threadId: string) => `/api/thread/${threadId}/pdf`;

/** Fills the store from a stored thread before anything renders against it. */
export function seedResume(seed: SeededResume) {
  useResumeStore.setState({
    doc: seed.doc ?? blankResume(),
    // Whether the stored document was ever edited is not recorded, so a
    // reopened thread renders its live document rather than guessing.
    touched: Boolean(seed.doc && !isEmptyResume(seed.doc)),
    sourceText: seed.sourceText ?? "",
    sourceName: seed.sourceName ?? "",
    // Drawn through the route rather than from storage, which is what keeps
    // the file behind the same check as the thread it belongs to.
    originalUrl: seed.id && seed.pdfPath ? storedPdfUrl(seed.id) : null,
    pdfPath: seed.pdfPath ?? null,
  });
}
