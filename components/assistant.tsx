"use client";

import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import {
  AssistantRuntimeProvider,
  useAuiState,
  WebSpeechDictationAdapter,
} from "@assistant-ui/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useState } from "react";
import { Thread } from "@/components/assistant-ui/thread";
import { AuthDialog } from "@/components/auth-dialog";
import { ComposerDraft } from "@/components/composer-draft";
import { DearCvWordmark } from "@/components/dearcv-wordmark";
import { ResumeTools } from "@/components/resume-tools";
import { Button } from "@/components/ui/button";
import { attachments } from "@/lib/attachments";
import { isEmptyResume } from "@/lib/resume/schema";
import { providerLabel } from "@/lib/providers";
import { authHeaders, useAuthStore } from "@/lib/store/auth";
import { useResumeStore } from "@/lib/store/resume";
import { useThreadStore } from "@/lib/store/thread";

/**
 * Web Speech lives on `window` and only in some browsers, so the answer can't
 * be known while rendering on the server. Deciding after mount keeps the first
 * client render matching the server's, and the mic button simply never appears
 * where dictation wouldn't work.
 */
function useDictation() {
  const [dictation, setDictation] = useState<WebSpeechDictationAdapter>();

  useEffect(() => {
    if (WebSpeechDictationAdapter.isSupported()) {
      setDictation(new WebSpeechDictationAdapter());
    }
  }, []);

  return dictation;
}

export function Assistant() {
  const dictation = useDictation();
  // Read once. The runtime binds both at mount and neither changes after.
  const [thread] = useState(() => useThreadStore.getState());

  const runtime = useChatRuntime({
    id: thread.id,
    messages: thread.initialMessages,
    adapters: { dictation, attachments },
    // Continuing the tool loop is for turns taken here and now. Every saved
    // thread ends on a finished tool call, which this reads as a loop left
    // hanging — so reopening one would fire a turn nobody asked for, before
    // the key has even been read back out of storage.
    sendAutomaticallyWhen: ({ messages }) =>
      messages.length > thread.initialMessages.length &&
      lastAssistantMessageIsCompleteWithToolCalls({ messages }),
    transport: new AssistantChatTransport({
      api: "/api/chat",
      headers: () => authHeaders(),
      body: () => {
        const { doc, sourceText } = useResumeStore.getState();
        // The transport overwrites `id` with its own thread-list id, so the
        // thread to save the turn under has to travel under its own name.
        return {
          threadId: useThreadStore.getState().id,
          doc,
          // The upload only matters until it becomes the document.
          sourceText: isEmptyResume(doc) ? sourceText : "",
        };
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AuthBootstrap />
      <ResumeTools />
      <AddressThread />
      <ComposerDraft />
      <AuthDialog />
      <div className="flex h-full min-h-0 flex-col">
        <ChatHeader />
        <div className="min-h-0 flex-1">
          <Thread
            components={{
              Welcome: ResumeWelcome,
            }}
          />
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}

/**
 * An empty thread is not worth a URL or a row — most visits never send
 * anything. Sending is not enough either: a turn that dies on a rejected key
 * or a dropped connection would still have taken the URL, written a row, and
 * pushed the PDF into storage. The model answering is the first moment any of
 * that is worth keeping.
 */
function AddressThread() {
  const answered = useAuiState((s) =>
    s.thread.messages.some((message) => message.role === "assistant" && message.content.length > 0),
  );
  const address = useThreadStore((s) => s.address);

  useEffect(() => {
    if (answered) address();
  }, [answered, address]);

  return null;
}

function ResumeWelcome() {
  return (
    <div className="mb-6 px-4">
      <h1 className="text-xl font-medium tracking-tight">Let&rsquo;s fix up your resume.</h1>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm leading-relaxed">
        Drop in the one you have and I&rsquo;ll keep its look, or tell me about yourself and
        we&rsquo;ll start fresh. Point me at your GitHub or LinkedIn and I&rsquo;ll read up.
      </p>
    </div>
  );
}

function ChatHeader() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const apiKey = useAuthStore((s) => s.apiKey);
  const serverConfigured = useAuthStore((s) => s.serverConfigured);
  const provider = useAuthStore((s) => s.provider);
  const openDialog = useAuthStore((s) => s.openDialog);
  const connected = Boolean(apiKey || serverConfigured);
  const label = apiKey ? providerLabel(provider) : serverConfigured ? "Ready" : "Connect";

  return (
    <header className="flex h-12 shrink-0 items-center justify-between px-4">
      <DearCvWordmark />
      {hydrated && (
        <Button variant={connected ? "text" : "blush"} size="sm" onClick={openDialog}>
          {label}
        </Button>
      )}
    </header>
  );
}

function AuthBootstrap() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const setServerConfigured = useAuthStore((s) => s.setServerConfigured);

  useEffect(() => {
    hydrate();
    void fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data: { configured?: boolean }) => {
        setServerConfigured(Boolean(data.configured));
      })
      .catch(() => undefined);
  }, [hydrate, setServerConfigured]);

  return null;
}
