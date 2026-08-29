import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: true });
  return Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
}
