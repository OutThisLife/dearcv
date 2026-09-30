"use client";

import { useEffect, useState } from "react";
import { StatusScreen } from "@/components/status-screen";
import { CHATGPT_CHANNEL, type ChatGptCallback } from "@/lib/chatgpt";

/**
 * Where ChatGPT sends the sign-in popup back. The window that opened it can't
 * be reached from here — OpenAI's page severs that link — so the result goes
 * out on a channel the opener is listening to, and the popup closes itself.
 */
export default function ChatGptCallbackPage() {
  const [lingering, setLingering] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message: ChatGptCallback = {
      source: CHATGPT_CHANNEL,
      code: params.get("code"),
      state: params.get("state"),
      clientId: params.get("client_id"),
      error: params.get("error"),
    };
    const channel = new BroadcastChannel(CHATGPT_CHANNEL);
    channel.postMessage(message);
    channel.close();
    // The code is single-use and already on its way; keep it out of history.
    window.history.replaceState(null, "", window.location.pathname);

    window.close();
    // Some browsers won't let a severed popup close itself.
    const timer = window.setTimeout(() => setLingering(true), 400);
    return () => window.clearTimeout(timer);
  }, []);

  return lingering ? (
    <StatusScreen title="You're signed in" description="You can close this window." />
  ) : null;
}
