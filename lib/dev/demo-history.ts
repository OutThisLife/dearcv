import { runTool } from "@/components/resume-tools";
import { readPdf } from "@/lib/resume/read-pdf";
import { resumeContentSchema } from "@/lib/resume/schema";
import { useResumeStore } from "@/lib/store/resume";
import transcription from "./brooklyn-resume.json";
import { DEMO_REQUESTS } from "./demo-thread";

const SAMPLE = "/brooklyn-resume.pdf";

/**
 * Development only: puts the sample resume on the page already carried across,
 * then replays the demo conversation's calls through the real tools, each
 * under the message that asked for it, so the page and the history end up
 * exactly where a real session would have left them.
 *
 * Once per page: development mounts twice, and with the tools now awaited the
 * two replays interleaved and the second removed a section the first already had.
 */
let seeding: Promise<void> | null = null;
export const seedDemoHistory = () => (seeding ??= seed());

async function seed() {
  const file = new File([await (await fetch(SAMPLE)).blob()], "brooklyn-resume.pdf", {
    type: "application/pdf",
  });
  const { text, look, layout } = await readPdf(await file.arrayBuffer());

  const store = useResumeStore.getState();
  store.resetBlank();
  store.setOriginalUrl(URL.createObjectURL(file));
  store.setSource(file, text, look, layout);
  store.adoptContent(resumeContentSchema.parse(transcription), text);

  for (const request of DEMO_REQUESTS) {
    for (const call of request.calls) {
      await runTool(call.tool, call.input, { id: request.id, text: request.text });
    }
  }
}
