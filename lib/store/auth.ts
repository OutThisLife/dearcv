import { create } from "zustand";
import type { ChatGptAccount, ChatGptAvailability } from "@/lib/chatgpt";
import { renewChatGpt, signOutOfChatGpt } from "@/lib/chatgpt-signin";
import type { LlmProvider } from "@/lib/providers";

const STORAGE_KEY = "dear-cv.auth";

/**
 * Where the credential came from: signing in with OpenRouter, the paste field,
 * or signing in with ChatGPT — the one kind the page never holds, since its
 * tokens live in a cookie script can't read.
 */
export type AuthVia = "oauth" | "key" | "chatgpt";

type StoredAuth = {
  provider: LlmProvider;
  apiKey: string;
  via: AuthVia;
  /** ChatGPT only: who is signed in, and when the server's token lapses. */
  account?: string | null;
  expiresAt?: number;
};

/** Renew a ChatGPT token this long before it lapses, so no request races it. */
const RENEW_AHEAD = 5 * 60_000;

const holdsCredential = (auth: Pick<StoredAuth, "apiKey" | "via">) =>
  Boolean(auth.apiKey) || auth.via === "chatgpt";

function readStored(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    return holdsCredential(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Turns the credential into a cookie saying which account it speaks for, so a
 * thread can tell its owner apart from whoever else has the link. A key goes
 * no further than the check itself; a ChatGPT sign-in is already known to the
 * server. Failing leaves them anonymous — able to work, just not to claim
 * anything — so it never blocks getting started.
 */
function startSession(auth: StoredAuth) {
  return fetch("/api/auth/session", {
    method: "POST",
    headers: sessionHeaders(auth),
  }).catch(() => undefined);
}

function sessionHeaders(auth: Pick<StoredAuth, "apiKey" | "provider" | "via">) {
  const headers: Record<string, string> = { "x-resume-provider": auth.provider };
  if (auth.via === "chatgpt") headers["x-resume-auth"] = "chatgpt";
  else if (auth.apiKey) headers.authorization = `Bearer ${auth.apiKey}`;
  return headers;
}

type AuthState = {
  provider: LlmProvider;
  apiKey: string;
  via: AuthVia;
  account: string | null;
  expiresAt: number;
  serverConfigured: boolean;
  chatgpt: ChatGptAvailability;
  dialogOpen: boolean;
  /** The one-time "you're using your ChatGPT plan" note after a first sign-in. */
  welcome: boolean;
  pendingSend: boolean;
  hydrated: boolean;
  connect: (next: StoredAuth, options?: { welcome?: boolean }) => void;
  connectChatGpt: (account: ChatGptAccount, options?: { welcome?: boolean }) => void;
  disconnect: () => void;
  openDialog: () => void;
  closeDialog: () => void;
  requestSend: () => void;
  clearPendingSend: () => void;
  hydrate: () => void;
  setServerStatus: (status: { configured: boolean; chatgpt: ChatGptAvailability }) => void;
};

const SIGNED_OUT = {
  apiKey: "",
  provider: "openrouter" as LlmProvider,
  via: "key" as AuthVia,
  account: null,
  expiresAt: 0,
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  ...SIGNED_OUT,
  serverConfigured: false,
  chatgpt: null,
  dialogOpen: false,
  welcome: false,
  pendingSend: false,
  hydrated: false,
  connect: (next, options) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const welcome = Boolean(options?.welcome);
    set({ ...SIGNED_OUT, ...next, dialogOpen: welcome, welcome });
    // A ChatGPT sign-in started its session while it was being verified.
    if (next.via !== "chatgpt") void startSession(next);
  },
  connectChatGpt: (account, options) =>
    get().connect(
      {
        provider: "openai",
        apiKey: "",
        via: "chatgpt",
        account: account.email,
        expiresAt: account.expiresAt,
      },
      options,
    ),
  disconnect: () => {
    if (get().via === "chatgpt") void signOutOfChatGpt();
    localStorage.removeItem(STORAGE_KEY);
    set(SIGNED_OUT);
    void fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
  },
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false, welcome: false, pendingSend: false }),
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
  setServerStatus: ({ configured, chatgpt }) => set({ serverConfigured: configured, chatgpt }),
}));

export function isAuthed() {
  const state = useAuthStore.getState();
  return holdsCredential(state) || state.serverConfigured;
}

/** `isAuthed` for render paths, so components subscribe to the answer itself. */
export const useIsAuthed = () => useAuthStore((s) => holdsCredential(s) || s.serverConfigured);

/**
 * A ChatGPT token lives an hour, so a request may have to renew it first.
 * Renewal failing for good signs them out and reopens Connect; failing just
 * this once lets the request go and report whatever the server says.
 */
async function ensureChatGptFresh() {
  const { expiresAt } = useAuthStore.getState();
  if (expiresAt - Date.now() > RENEW_AHEAD) return;

  try {
    const account = await renewChatGpt();
    if (!account) {
      useAuthStore.getState().disconnect();
      useAuthStore.getState().openDialog();
      return;
    }
    const stored = readStored();
    if (stored?.via !== "chatgpt") return;
    const next = { ...stored, account: account.email, expiresAt: account.expiresAt };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    useAuthStore.setState({ account: next.account, expiresAt: next.expiresAt });
  } catch (error) {
    console.error("Couldn't renew the ChatGPT sign-in.", error);
  }
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (useAuthStore.getState().via === "chatgpt") await ensureChatGptFresh();
  return sessionHeaders(useAuthStore.getState());
}
