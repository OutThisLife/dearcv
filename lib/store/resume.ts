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
  /** Where the upload lives once stored, as opposed to the local blob: URL. */
  pdfUrl: string | null;
  previewUrl: string | null;
  ingesting: boolean;
  setPdfUrl: (url: string | null) => void;
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
  pdfUrl: null,
  previewUrl: null,
  ingesting: false,
  setPdfUrl: (pdfUrl) => set({ pdfUrl }),
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
    }),
  setOriginalUrl: (originalUrl) => set({ originalUrl }),
  setPreviewUrl: (previewUrl) => set({ previewUrl }),
  setIngesting: (ingesting) => set({ ingesting }),
  resetBlank: () => {
    const { originalUrl } = get();
    if (originalUrl?.startsWith("blob:")) URL.revokeObjectURL(originalUrl);
    set({
      doc: blankResume(),
      sourceText: "",
      sourceName: "",
      file: null,
      originalUrl: null,
      pdfUrl: null,
    });
  },
}));

export type SeededResume = {
  doc?: ResumeDoc | null;
  sourceText?: string;
  sourceName?: string;
  pdfUrl?: string | null;
};

/** Fills the store from a stored thread before anything renders against it. */
export function seedResume(seed: SeededResume) {
  useResumeStore.setState({
    doc: seed.doc ?? blankResume(),
    sourceText: seed.sourceText ?? "",
    sourceName: seed.sourceName ?? "",
    // A stored upload is served from its own URL, so it is both the thing to
    // draw and the thing to keep.
    originalUrl: seed.pdfUrl ?? null,
    pdfUrl: seed.pdfUrl ?? null,
  });
}
