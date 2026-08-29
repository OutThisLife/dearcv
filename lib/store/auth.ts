import { create } from "zustand";
import type { LlmProvider } from "@/lib/providers";

const STORAGE_KEY = "dear-cv.auth";

/** Whether the stored key came from signing in or from the paste field. */
export type AuthVia = "oauth" | "key";

type StoredAuth = {
  provider: LlmProvider;
  apiKey: string;
  via: AuthVia;
};

function readStored(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (!parsed.apiKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Turns the key into a cookie saying which account it speaks for, so a thread
 * can tell its owner apart from whoever else has the link. The key goes no
 * further than the check itself. Failing leaves them anonymous — able to work,
 * just not to claim anything — so it never blocks getting started.
 */
function startSession(auth: StoredAuth) {
  return fetch("/api/auth/session", {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.apiKey}`,
      "x-resume-provider": auth.provider,
    },
  }).catch(() => undefined);
}

type AuthState = {
  provider: LlmProvider;
  apiKey: string;
  via: AuthVia;
  serverConfigured: boolean;
  dialogOpen: boolean;
  pendingSend: boolean;
  hydrated: boolean;
  connect: (next: StoredAuth) => void;
  disconnect: () => void;
  openDialog: () => void;
  closeDialog: () => void;
  requestSend: () => void;
  clearPendingSend: () => void;
  hydrate: () => void;
  setServerConfigured: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>()((set) => ({
  provider: "openrouter",
  apiKey: "",
  via: "key",
  serverConfigured: false,
  dialogOpen: false,
  pendingSend: false,
  hydrated: false,
  connect: (next) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set({ ...next, dialogOpen: false });
    void startSession(next);
  },
  disconnect: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ apiKey: "", provider: "openrouter", via: "key" });
    void fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
  },
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false, pendingSend: false }),
  requestSend: () => set({ pendingSend: true, dialogOpen: true }),
  clearPendingSend: () => set({ pendingSend: false }),
  hydrate: () => {
    const stored = readStored();
    set({
      ...stored,
      hydrated: true,
    });
    // A cookie expires, gets cleared, or was never minted on this device. The
    // key in localStorage is what can produce another one.
    if (stored) void startSession(stored);
  },
  setServerConfigured: (serverConfigured) => set({ serverConfigured }),
}));

export function isAuthed() {
  const { apiKey, serverConfigured } = useAuthStore.getState();
  return Boolean(apiKey || serverConfigured);
}

/** `isAuthed` for render paths, so components subscribe to the answer itself. */
export const useIsAuthed = () => useAuthStore((s) => Boolean(s.apiKey || s.serverConfigured));

export function authHeaders(): Record<string, string> {
  const { apiKey, provider } = useAuthStore.getState();
  const headers: Record<string, string> = { "x-resume-provider": provider };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}
