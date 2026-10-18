"use client";

import { useEffect } from "react";
import { OAUTH_MESSAGE } from "@/lib/openrouter-oauth";

export default function OpenRouterCallback() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    const message = { source: OAUTH_MESSAGE, code };
    const channel = new BroadcastChannel(OAUTH_MESSAGE);
    channel.postMessage(message);
    channel.close();
    window.opener?.postMessage(message, window.location.origin);
    window.setTimeout(() => window.close(), 150);
  }, []);

  return null;
}
