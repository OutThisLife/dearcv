import { notFound } from "next/navigation";
import { EditorClient } from "@/components/editor-client";
import { isThreadId, loadThread } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * An id we have never seen is not an error — it is an empty thread that
 * already has an address, which is what a fresh one becomes anyway.
 */
export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  if (!isThreadId(threadId)) notFound();

  const thread = await loadThread(threadId);

  return (
    <EditorClient
      seed={{
        id: threadId,
        messages: thread?.messages ?? [],
        doc: thread?.doc ?? null,
        sourceText: thread?.sourceText ?? "",
        sourceName: thread?.sourceName ?? "",
        pdfUrl: thread?.pdfUrl ?? null,
      }}
    />
  );
}
