"use client";

import { useEffect } from "react";
import { OAUTH_MESSAGE } from "@/lib/openrouter-oauth";

export default function OpenRouterCallback() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    window.opener?.postMessage({ source: OAUTH_MESSAGE, code }, window.location.origin);
    window.setTimeout(() => window.close(), 100);
  }, []);

  return null;
}
