import { isEmptyResume, MAX_PDF_BYTES, resumeContentSchema } from "@/lib/resume/schema";
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
    const { text, look, layout } = await readPdf(await file.arrayBuffer());
    // The page is read here, while the coordinates still exist. What they
    // mean is worked out once the transcription says what each line is.
    store.setSource(file, text, look, layout);
    // A scan with no text layer reads as a blank file. Nothing is broken, but
    // the agent is about to look like it cannot see a document that is plainly
    // on screen, so say why first.
    if (!text.trim()) {
      store.setError("That PDF is a scan with no text in it, so tell me what's on it.");
    } else {
      // Fire the transcription now rather than inside their first request, so
      // "change my name" can be a one-field patch instead of a full rebuild.
      void ensureCarried();
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

let carrying: { source: string; done: Promise<void> } | null = null;

/**
 * Transcribes the upload into the live document, once per file. Started at
 * upload, and awaited again before every chat turn — so a first request never
 * reaches the model with the resume still untranscribed and left to be copied
 * out by hand, which is where a whole rewrite used to lose its bold, its order,
 * and gain sections it never had. Signing in later is covered by the same
 * call: an attempt that could not be authorised is simply tried again.
 *
 * Failure is not worth an error. The chat can still carry the resume across
 * itself; this only makes it the exception.
 */
export function ensureCarried(): Promise<void> {
  const { doc, sourceText } = useResumeStore.getState();
  if (!sourceText.trim() || !isEmptyResume(doc)) return Promise.resolve();
  if (carrying?.source === sourceText) return carrying.done;

  const attempt = {
    source: sourceText,
    done: carrySource(sourceText).then((landed) => {
      // Only a landed transcription is remembered; anything else is retried.
      if (!landed && carrying === attempt) carrying = null;
    }),
  };
  carrying = attempt;
  return attempt.done;
}

async function carrySource(sourceText: string) {
  try {
    const res = await fetch("/api/carry", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ sourceText }),
    });
    if (!res.ok) return false;

    const { content } = (await res.json()) as { content?: unknown };
    const parsed = resumeContentSchema.safeParse(content);
    if (!parsed.success) return false;
    useResumeStore.getState().adoptContent(parsed.data, sourceText);
    return true;
  } catch (error) {
    console.error("Background carry didn't land.", error);
    return false;
  }
}
