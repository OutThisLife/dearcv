import { redirect } from "next/navigation";
import { EditorClient } from "@/components/editor-client";
import { LockedThread } from "@/components/locked-thread";
import { isThreadId, loadThread, mayRead } from "@/lib/db";
import { readViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * A thread that isn't there — mistyped, long since swept, never written — is
 * not worth a page of its own. Starting a new one is what they'd do next
 * anyway, so it just happens.
 */
export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  if (!isThreadId(threadId)) redirect("/");

  const thread = await loadThread(threadId);
  if (!thread) redirect("/");
  // Nothing about the thread reaches the browser on a refusal, not even that it
  // has anything in it.
  if (!mayRead(thread, await readViewer())) return <LockedThread />;

  return (
    <EditorClient
      seed={{
        id: threadId,
        messages: thread.messages,
        doc: thread.doc,
        sourceText: thread.sourceText,
        sourceName: thread.sourceName,
        pdfPath: thread.pdfPath,
      }}
    />
  );
}
