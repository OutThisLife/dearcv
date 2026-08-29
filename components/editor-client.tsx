"use client";

import dynamic from "next/dynamic";

/**
 * A stored thread renders in the browser only. The resume stores are module
 * singletons, so seeding them while rendering on the server would let one
 * person's document land in the next person's HTML.
 */
export const EditorClient = dynamic(() => import("@/components/editor").then((m) => m.Editor), {
  ssr: false,
});
