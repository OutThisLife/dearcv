import { notFound } from "next/navigation";
import { EditorClient } from "@/components/editor-client";
import { LockedThread } from "@/components/locked-thread";
import { isThreadId, loadThread, mayRead } from "@/lib/db";
import { readViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * An id we have never seen is not an error — it is an empty thread that
 * already has an address, which is what a fresh one becomes anyway.
 */
export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  if (!isThreadId(threadId)) notFound();

  const thread = await loadThread(threadId);
  // Nothing about the thread reaches the browser on a refusal, not even that it
  // has anything in it.
  if (thread && !mayRead(thread, await readViewer())) return <LockedThread />;

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
