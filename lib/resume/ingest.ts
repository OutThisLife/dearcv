import { isEmptyResume, MAX_PDF_BYTES, resumeContentSchema } from "@/lib/resume/schema";
import { authHeaders } from "@/lib/store/auth";
import { boxIds } from "@/lib/resume/pdf-boxes";
import { advanceHead } from "@/lib/resume/reading-head";
import { useActivityStore } from "@/lib/store/activity";
import { useResumeStore } from "@/lib/store/resume";

/**
 * Activity keys for the upload being read and then transcribed: nobody's tool
 * call, but work on the whole page all the same.
 */
const READING = "reading";
const CARRYING = "carrying";

/**
 * The upload being read, while it is. A message sent with the PDF attached
 * goes out in the same moment the file starts being read; without this to
 * wait on, the turn found no text yet, skipped the transcription, and the
 * model was told the resume was empty while it sat open beside the chat.
 */
let reading: Promise<void> | null = null;

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
  // The page scans while it is being read, through to the transcription below.
  useActivityStore.getState().work(READING, boxIds.page);

  let done = () => {};
  reading = new Promise((resolve) => (done = resolve));
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
    useActivityStore.getState().done(READING);
    done();
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
export async function ensureCarried(): Promise<void> {
  await reading;
  const { doc, sourceText } = useResumeStore.getState();
  if (!sourceText.trim() || !isEmptyResume(doc)) return;
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
  const activity = useActivityStore.getState();
  activity.work(CARRYING, boxIds.page);
  try {
    const res = await fetch("/api/carry", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ sourceText }),
    });
    if (!res.ok || !res.body) return false;

    // Lines of JSON: where the model has got to, then the resume, or why not.
    let content: unknown;
    // Read by hand: Safari's streams are not async-iterable.
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      pending += read.value;
      const complete = pending.split("\n");
      pending = complete.pop() ?? "";
      for (const line of complete) {
        if (!line.trim()) continue;
        const message = JSON.parse(line) as { at?: string; content?: unknown; error?: string };
        if (message.at) follow(message.at);
        if (message.content) content = message.content;
        if (message.error) return false;
      }
    }

    const parsed = resumeContentSchema.safeParse(content);
    if (!parsed.success) return false;
    useResumeStore.getState().adoptContent(parsed.data, sourceText);
    return true;
  } catch (error) {
    console.error("Background carry didn't land.", error);
    return false;
  } finally {
    activity.readTo(null);
    activity.done(CARRYING);
  }
}

/**
 * Moves the reading head on to wherever this text is on the uploaded page.
 * Fed by anything copying the upload out a few words at a time: the
 * background transcription, or — when that never landed — a whole-resume
 * edit streaming in, which is otherwise a long silence.
 */
export function follow(text: string | undefined) {
  const runs = useResumeStore.getState().layout?.runs;
  if (!text || !runs?.length) return;
  const { head, readTo } = useActivityStore.getState();
  const next = advanceHead(runs, head ?? -1, text);
  if (next >= 0 && next !== head) readTo(next);
}

/** Whether the upload is still being read into a document, for anything that says so. */
export const useReading = () =>
  useActivityStore((s) => READING in s.working || CARRYING in s.working);
