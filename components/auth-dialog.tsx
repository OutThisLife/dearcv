"use client";

import { ArrowUpRightIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CHATGPT_USAGE_URL } from "@/lib/chatgpt";
import { signInWithChatGpt } from "@/lib/chatgpt-signin";
import { connectOpenRouter } from "@/lib/openrouter-oauth";
import { PROVIDERS, providerLabel, type LlmProvider } from "@/lib/providers";
import { useAuthStore } from "@/lib/store/auth";
import { cn } from "@/lib/utils";

const PROVIDER_OPTIONS = PROVIDERS.map(({ id, label }) => ({ id, label }));

const linkClass = cn(buttonVariants({ variant: "text", size: "inline" }), "gap-0.5");

/**
 * Each sign-in wears its provider's mark, as OpenAI's guidelines ask of its
 * button — and both do, so the two labels line up instead of jogging.
 */
const MARKS = {
  chatgpt:
    "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
  openrouter:
    "M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z",
};

function ProviderMark({ id }: { id: keyof typeof MARKS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="fill-current">
      <path d={MARKS[id]} />
    </svg>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
      <ArrowUpRightIcon className="size-3" />
    </a>
  );
}

/** The same page on 127.0.0.1, the only origin OpenAI's open-source sign-in returns to. */
const loopbackHref = () =>
  typeof window === "undefined"
    ? "http://127.0.0.1:3000"
    : `http://127.0.0.1:${window.location.port}${window.location.pathname}`;

/**
 * Shown once, after the first ChatGPT sign-in, because OpenAI asks that people
 * be told plainly when an app starts spending their plan.
 */
function PlanWelcome({ onDone }: { onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>You&rsquo;re using your ChatGPT plan</DialogTitle>
        <DialogDescription>
          What you ask DearCV now draws on your plan. You can see that usage, and cap it, in
          ChatGPT&rsquo;s settings.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <Button onClick={onDone}>Got it</Button>
        <span className="justify-self-center text-sm">
          <ExternalLink href={CHATGPT_USAGE_URL}>Manage usage</ExternalLink>
        </span>
      </div>
    </>
  );
}

export function AuthDialog() {
  // Subscribed, because the dialog is drawn from them.
  const dialogOpen = useAuthStore((s) => s.dialogOpen);
  const welcome = useAuthStore((s) => s.welcome);
  const storedProvider = useAuthStore((s) => s.provider);
  const storedApiKey = useAuthStore((s) => s.apiKey);
  const storedVia = useAuthStore((s) => s.via);
  const account = useAuthStore((s) => s.account);
  const chatgpt = useAuthStore((s) => s.chatgpt);

  // Not subscribed, because an action never changes.
  const { closeDialog, connect, connectChatGpt, disconnect } = useAuthStore.getState();

  const [provider, setProvider] = useState<LlmProvider>(storedProvider);
  const [apiKey, setApiKey] = useState("");
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState<"" | "oauth" | "chatgpt" | "key">("");
  const [error, setError] = useState("");
  const pendingChatGpt = useRef<AbortController | null>(null);

  const signedIn = Boolean(storedApiKey) || storedVia === "chatgpt";

  // Seed the draft when the dialog opens and then leave it alone. Reading the
  // store reactively here would let any later write — a disconnect, say — reset
  // the form out from under whoever is typing in it.
  useEffect(() => {
    if (!dialogOpen) {
      // Closing the dialog gives up on a ChatGPT popup still being waited on.
      pendingChatGpt.current?.abort();
      return;
    }
    const stored = useAuthStore.getState();
    const pasted = Boolean(stored.apiKey) && stored.via === "key";
    setProvider(stored.provider);
    // A key from signing in is ours, not something they typed — don't show it
    // back to them in the paste field as though they had.
    setApiKey(pasted ? stored.apiKey : "");
    setPasting(pasted);
    setBusy("");
    setError("");
  }, [dialogOpen]);

  const forget = () => {
    disconnect();
    setApiKey("");
    setPasting(false);
  };

  const meta = PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0];

  // Don't save a key we haven't seen work — the alternative is a confusing
  // provider error on their first message.
  const submitKey = async () => {
    const key = apiKey.trim();
    if (!key || busy) return;

    // Leave any existing error up. Clearing it here only to set it again a
    // moment later collapses the banner and jolts the whole dialog.
    setBusy("key");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, apiKey: key }),
      });
      const result = (await res.json()) as { ok: boolean; error?: string };
      if (!result.ok) {
        setError(result.error ?? "That key didn't work.");
        return;
      }
      connect({ provider, apiKey: key, via: "key" });
    } catch {
      setError("Couldn't check that key. Are you online?");
    } finally {
      setBusy("");
    }
  };

  const signIn = async () => {
    if (busy) return;
    setBusy("oauth");
    try {
      connect({
        provider: "openrouter",
        apiKey: await connectOpenRouter(),
        via: "oauth",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work.");
    } finally {
      setBusy("");
    }
  };

  const signInChatGpt = async () => {
    if (busy || !chatgpt || chatgpt === "loopback") return;
    const controller = new AbortController();
    pendingChatGpt.current = controller;
    setBusy("chatgpt");
    try {
      const { account, firstTime } = await signInWithChatGpt(chatgpt.clientId, controller.signal);
      connectChatGpt(account, { welcome: firstTime });
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "That didn't work.");
      }
    } finally {
      if (pendingChatGpt.current === controller) pendingChatGpt.current = null;
      setBusy("");
    }
  };

  const offersChatGpt = Boolean(chatgpt);

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent className="sm:max-w-sm" bodyClassName="gap-5 p-5" banner={error}>
        {welcome ? (
          <PlanWelcome onDone={closeDialog} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Connect your account</DialogTitle>
              <DialogDescription>
                Sign in and you&rsquo;re writing. It runs on your own plan or credits, and nothing
                is kept on our end.
              </DialogDescription>
            </DialogHeader>

            {/* One track that may shrink, so a long email truncates instead of
                widening every button beneath it. */}
            <div className="grid grid-cols-1 gap-3">
              {signedIn ? (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="text-muted-foreground min-w-0">
                    <p className="truncate">
                      {storedVia === "chatgpt"
                        ? "Using your ChatGPT plan."
                        : storedVia === "oauth"
                          ? "Signed in with OpenRouter."
                          : `Using your ${providerLabel(storedProvider)} key.`}
                    </p>
                    {storedVia === "chatgpt" && account ? (
                      <p className="truncate">{account}</p>
                    ) : null}
                  </div>
                  <span className="flex shrink-0 items-center gap-3">
                    {storedVia === "chatgpt" && (
                      <ExternalLink href={CHATGPT_USAGE_URL}>Manage usage</ExternalLink>
                    )}
                    <Button variant="text" size="inline" onClick={forget}>
                      Disconnect
                    </Button>
                  </span>
                </div>
              ) : null}

              {chatgpt === "loopback" ? (
                // Same machine, different origin: the popup would report back
                // to 127.0.0.1 and find nobody listening.
                <div className="grid gap-1.5">
                  <a href={loopbackHref()} className={cn(buttonVariants(), "gap-2")}>
                    <ProviderMark id="chatgpt" />
                    Continue with ChatGPT
                  </a>
                  <p className="text-muted-foreground text-center text-xs">
                    Reopens DearCV at 127.0.0.1 — the one local address ChatGPT signs in to.
                  </p>
                </div>
              ) : offersChatGpt ? (
                <Button
                  onClick={signInChatGpt}
                  loading={busy === "chatgpt"}
                  disabled={Boolean(busy)}
                  className="gap-2"
                >
                  <ProviderMark id="chatgpt" />
                  {storedVia === "chatgpt" ? "Sign in with ChatGPT again" : "Continue with ChatGPT"}
                </Button>
              ) : null}

              {busy === "chatgpt" ? (
                <p className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
                  Finish signing in in the ChatGPT window.
                  <Button
                    variant="text"
                    size="inline"
                    onClick={() => pendingChatGpt.current?.abort()}
                  >
                    Cancel
                  </Button>
                </p>
              ) : null}

              <Button
                variant={offersChatGpt ? "outline" : "default"}
                onClick={signIn}
                loading={busy === "oauth"}
                disabled={Boolean(busy)}
                className="gap-2"
              >
                <ProviderMark id="openrouter" />
                {storedVia === "oauth"
                  ? "Sign in with OpenRouter again"
                  : "Continue with OpenRouter"}
              </Button>

              {pasting ? (
                <form
                  className="grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitKey();
                  }}
                >
                  <SegmentedControl
                    options={PROVIDER_OPTIONS}
                    value={provider}
                    onChange={setProvider}
                  />
                  <div className="grid gap-1.5">
                    <Input
                      type="password"
                      autoFocus
                      // Chrome ignores `off` on password fields; `new-password` is
                      // what actually stops autofill and the save-password prompt.
                      autoComplete="new-password"
                      placeholder={`Paste your ${meta.label} key · ${meta.placeholder}`}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <span className="text-xs">
                      <ExternalLink href={meta.keys.url}>
                        Get a key from {meta.keys.label}
                      </ExternalLink>
                    </span>
                  </div>
                  <Button
                    type="submit"
                    variant="secondary"
                    loading={busy === "key"}
                    disabled={!apiKey.trim() || Boolean(busy)}
                  >
                    Use this key
                  </Button>
                </form>
              ) : (
                <Button
                  variant="text"
                  size="inline"
                  className="justify-self-center"
                  onClick={() => setPasting(true)}
                >
                  or paste a key instead
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
