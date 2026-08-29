import { MAX_PDF_BYTES, resumeContentSchema } from "@/lib/resume/schema";
import { authHeaders } from "@/lib/store/auth";
import { useResumeStore } from "@/lib/store/resume";

export function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function pickPdf() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void ingestPdf(file);
  });
  input.click();
}

export async function ingestPdf(file: File) {
  const store = useResumeStore.getState();

  if (!isPdf(file)) {
    store.setError(`${file.name} isn't a PDF.`);
    return;
  }
  if (file.size > MAX_PDF_BYTES) {
    store.setError("That PDF is over 10MB. Export a lighter one and try again.");
    return;
  }

  // A new upload replaces whatever was there, including a resume built from
  // the previous file.
  store.resetBlank();

  // Show the file immediately. Reading it into an editable document costs
  // tokens and waits for the first real request; looking at it shouldn't.
  store.setOriginalUrl(URL.createObjectURL(file));
  store.setSource(file, "");
  store.setIngesting(true);

  try {
    const { readPdf } = await import("@/lib/resume/read-pdf");
    const { text, look } = await readPdf(await file.arrayBuffer());
    // The look is measured off the page here, while the coordinates still
    // exist. Nothing downstream ever sees them again.
    store.setSource(file, text, look);
    // A scan with no text layer reads as a blank file. Nothing is broken, but
    // the agent is about to look like it cannot see a document that is plainly
    // on screen, so say why first.
    if (!text.trim()) {
      store.setError("That PDF is a scan with no text in it, so tell me what's on it.");
    } else {
      // Fire the transcription now rather than inside their first request, so
      // "change my name" can be a one-field patch instead of a full rebuild.
      void carrySource(text);
    }
  } catch (error) {
    // A PDF we can't read still previews fine — it just can't be edited until
    // they say what's in it. Swallowing this silently hid a real bug once.
    console.error("Couldn't read text out of that PDF.", error);
    store.setError("Couldn't read that PDF. Tell me what's on it and I'll build from that.");
  } finally {
    store.setIngesting(false);
  }
}

/**
 * Failure here is not worth an error: the chat still carries the resume across
 * lazily on the first edit, exactly as it did before this existed. This only
 * makes that first edit instant when it can.
 */
async function carrySource(sourceText: string) {
  try {
    const res = await fetch("/api/carry", {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ sourceText }),
    });
    if (!res.ok) return;

    const { content } = (await res.json()) as { content?: unknown };
    const parsed = resumeContentSchema.safeParse(content);
    if (parsed.success) {
      useResumeStore.getState().adoptContent(parsed.data, sourceText);
    }
  } catch (error) {
    console.error("Background carry didn't land.", error);
  }
}
