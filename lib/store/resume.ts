import { create } from "zustand";
import {
  blankResume,
  isEmptyResume,
  type ResumeDoc,
  type ResumeItem,
  type ResumeSection,
  upsertById,
} from "@/lib/resume/schema";

type ResumeState = {
  doc: ResumeDoc;
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
  replaceContent: (doc: ResumeDoc) => void;
  patchDoc: (patch: Partial<ResumeDoc>) => void;
  upsertSection: (section: ResumeSection) => void;
  removeSection: (id: string) => boolean;
  upsertItem: (sectionId: string, item: ResumeItem) => boolean;
  removeItem: (sectionId: string, itemId: string) => boolean;
  setSource: (file: File, text: string) => void;
  setOriginalUrl: (url: string | null) => void;
  setPreviewUrl: (url: string | null) => void;
  setIngesting: (ingesting: boolean) => void;
  resetBlank: () => void;
};

const hasSection = (doc: ResumeDoc, id: string) =>
  doc.sections.some((section) => section.id === id);

export const useResumeStore = create<ResumeState>()((set, get) => ({
  doc: blankResume(),
  sourceText: "",
  sourceName: "",
  file: null,
  originalUrl: null,
  pdfPath: null,
  previewUrl: null,
  ingesting: false,
  error: null,
  setPdfPath: (pdfPath) => set({ pdfPath }),
  // Content rebuilds keep the live look. Theme only moves via update_theme,
  // except the first write onto a blank document.
  replaceContent: (doc) =>
    set((state) => ({
      doc: {
        ...doc,
        theme: isEmptyResume(state.doc) ? doc.theme : state.doc.theme,
      },
    })),
  patchDoc: (patch) => set((state) => ({ doc: { ...state.doc, ...patch } })),
  upsertSection: (section) =>
    set((state) => ({
      doc: {
        ...state.doc,
        sections: upsertById(state.doc.sections, section),
      },
    })),
  removeSection: (id) => {
    if (!hasSection(get().doc, id)) return false;
    set((state) => ({
      doc: {
        ...state.doc,
        sections: state.doc.sections.filter((section) => section.id !== id),
      },
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
    }));
    return true;
  },
  setSource: (file, text) =>
    set({
      file,
      sourceName: file.name,
      sourceText: text,
      // Whatever is in storage belongs to the PDF they just replaced, so it
      // stops standing for this one and the new file gets uploaded in its turn.
      pdfPath: null,
    }),
  setOriginalUrl: (originalUrl) => set({ originalUrl }),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  setIngesting: (ingesting) => set({ ingesting }),
  setError: (error) => set({ error }),
  resetBlank: () => {
    const { originalUrl } = get();
    if (originalUrl?.startsWith("blob:")) URL.revokeObjectURL(originalUrl);
    set({
      doc: blankResume(),
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
    sourceText: seed.sourceText ?? "",
    sourceName: seed.sourceName ?? "",
    // Drawn through the route rather than from storage, which is what keeps
    // the file behind the same check as the thread it belongs to.
    originalUrl: seed.id && seed.pdfPath ? storedPdfUrl(seed.id) : null,
    pdfPath: seed.pdfPath ?? null,
  });
}
