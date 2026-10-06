"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { useEffect } from "react";
import { linkChat, mirrorChat } from "@/lib/comments";
import { takeOver } from "@/lib/store/replay";

/**
 * Lets comments reach the chat, and keeps their threads in step with it. A
 * comment made while the chat is free is said in the chat — tagged with its
 * pin, so the left side shows it as the conversation it is — and the pin's
 * thread shows the chat's answer to it.
 */
export function CommentChatLink() {
  const aui = useAui();
  const messages = useAuiState((s) => s.thread.messages);
  const running = useAuiState((s) => s.thread.isRunning);

  // Re-linked on every render, not once: a hot reload of the comments
  // module drops the link, and a comment made after that silently took the
  // separate-agent path instead of coming here.
  useEffect(() =>
    linkChat({
      busy: () => aui.thread().getState().isRunning,
      send: async (commentId, text) => {
        // Said into the session as it was left, not into a replay of it.
        takeOver();
        const thread = aui.thread();
        // A reply to its own comment mid-answer steers it, as the chat does.
        if (thread.getState().isRunning) {
          thread.cancelRun();
          for (let wait = 0; aui.thread().getState().isRunning && wait < 50; wait += 1) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }
        aui.thread().append({
          role: "user",
          content: [{ type: "text", text }],
          metadata: { custom: { commentId } },
        });
      },
    }),
  );

  useEffect(() => mirrorChat(messages, running), [messages, running]);

  return null;
}
