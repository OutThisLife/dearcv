import {
  type AttachmentAdapter,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
} from "@assistant-ui/react";
import { ingestPdf } from "@/lib/resume/ingest";
import { isEmptyResume } from "@/lib/resume/schema";
import { keepPicture, newAssetId, readPicture } from "@/lib/store/assets";
import { useResumeStore } from "@/lib/store/resume";
import { useThreadStore } from "@/lib/store/thread";

/** Something is already on the right: an upload, or a document built in chat. */
const resumeOpen = () => {
  const { file, doc } = useResumeStore.getState();
  return Boolean(file) || !isEmptyResume(doc);
};

const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** assistant-ui ships image and text adapters, but no PDF one, and a resume is a PDF. */
const pdfAttachment: AttachmentAdapter = {
  accept: "application/pdf",
  async add({ file }) {
    // With nothing on the right yet, a PDF handed to the chat is their resume
    // nine times out of ten, so it opens there exactly as a drop would. Once a
    // resume is showing, another PDF is context — a job post, an export.
    if (!resumeOpen()) void ingestPdf(file);
    return {
      id: crypto.randomUUID(),
      type: "document",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  },
  async send(attachment) {
    // The resume's text already rides along with every turn, so sending its
    // pages too would have the model read — and bill for — the file twice.
    if (useResumeStore.getState().file === attachment.file) {
      return {
        ...attachment,
        status: { type: "complete" },
        content: [
          {
            type: "text",
            text: `(Attached ${attachment.name} — the resume now open beside this chat.)`,
          },
        ],
      };
    }
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          filename: attachment.name,
          mimeType: "application/pdf",
          data: await dataUrl(attachment.file),
        },
      ],
    };
  },
  async remove() {},
};

/**
 * An image attached to the chat is something to read — a screenshot, a job
 * post — and just as often something to put on the page: a headshot, a logo,
 * a drawing of their own. So it is kept as a picture of the thread as it is
 * sent, and the model is told the asset id that places it.
 */
class PlaceableImageAdapter extends SimpleImageAttachmentAdapter {
  override async send(attachment: Parameters<SimpleImageAttachmentAdapter["send"]>[0]) {
    const sent = await super.send(attachment);
    try {
      const key = newAssetId();
      await keepPicture(key, await readPicture(attachment.file), useThreadStore.getState().id);
      return {
        ...sent,
        content: [
          ...sent.content,
          {
            type: "text" as const,
            text: `(${attachment.name} can go on the page as image "${key}".)`,
          },
        ],
      };
    } catch {
      return sent;
    }
  }
}

/**
 * The runtime default accepts everything, which lets someone attach a zip the
 * model cannot open. These are the three kinds worth reading off a resume or a
 * profile, and naming them also filters the file picker.
 */
export const attachments = new CompositeAttachmentAdapter([
  new PlaceableImageAdapter(),
  pdfAttachment,
  new SimpleTextAttachmentAdapter(),
]);
