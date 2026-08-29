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
  if (!isPdf(file)) return;

  const store = useResumeStore.getState();
  // A new upload replaces whatever was there, including a resume built from
  // the previous file.
  store.resetBlank();

  // Show the file immediately. Reading it into an editable document costs
  // tokens and waits for the first real request; looking at it shouldn't.
  store.setOriginalUrl(URL.createObjectURL(file));
  store.setSource(file, "");
  store.setIngesting(true);

  try {
    const { extractPdfText } = await import("@/lib/resume/extract-text");
    store.setSource(file, await extractPdfText(await file.arrayBuffer()));
  } catch (error) {
    // A PDF we can't read still previews fine — it just can't be edited until
    // they say what's in it. Swallowing this silently hid a real bug once.
    console.error("Couldn't read text out of that PDF.", error);
  } finally {
    store.setIngesting(false);
  }
}
