import {
  type AttachmentAdapter,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
} from "@assistant-ui/react";

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
 * The runtime default accepts everything, which lets someone attach a zip the
 * model cannot open. These are the three kinds worth reading off a resume or a
 * profile, and naming them also filters the file picker.
 */
export const attachments = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  pdfAttachment,
  new SimpleTextAttachmentAdapter(),
]);
