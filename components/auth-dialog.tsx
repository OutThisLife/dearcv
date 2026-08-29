"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { connectOpenRouter } from "@/lib/openrouter-oauth";
import { PROVIDERS, providerLabel, type LlmProvider } from "@/lib/providers";
import { useAuthStore } from "@/lib/store/auth";

const PROVIDER_OPTIONS = PROVIDERS.map(({ id, label }) => ({ id, label }));

export function AuthDialog() {
  const dialogOpen = useAuthStore((s) => s.dialogOpen);
  const closeDialog = useAuthStore((s) => s.closeDialog);
  const connect = useAuthStore((s) => s.connect);
  const disconnect = useAuthStore((s) => s.disconnect);
  const storedProvider = useAuthStore((s) => s.provider);
  const storedApiKey = useAuthStore((s) => s.apiKey);
  const storedVia = useAuthStore((s) => s.via);

  const [provider, setProvider] = useState<LlmProvider>(storedProvider);
  const [apiKey, setApiKey] = useState("");
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState<"" | "oauth" | "key">("");
  const [error, setError] = useState("");

  const signedIn = Boolean(storedApiKey);

  // Seed the draft when the dialog opens and then leave it alone. Reading the
  // store reactively here would let any later write — a disconnect, say — reset
  // the form out from under whoever is typing in it.
  useEffect(() => {
    if (!dialogOpen) return;
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

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent className="sm:max-w-sm" bodyClassName="gap-5 p-5" banner={error}>
        <DialogHeader>
          <DialogTitle>Connect OpenRouter</DialogTitle>
          <DialogDescription>
            Sign in and you&rsquo;re writing. It runs on your own OpenRouter credits, and nothing is
            kept on our end.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {signedIn ? (
            <div className="flex items-center justify-between gap-3 text-xs">
              <p className="text-muted-foreground min-w-0 truncate">
                {storedVia === "oauth"
                  ? "Signed in with OpenRouter."
                  : `Using your ${providerLabel(storedProvider)} key.`}
              </p>
              <Button variant="text" size="inline" onClick={forget}>
                Disconnect
              </Button>
            </div>
          ) : null}

          <Button onClick={signIn} loading={busy === "oauth"} disabled={Boolean(busy)}>
            {signedIn ? "Sign in with OpenRouter again" : "Continue with OpenRouter"}
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
      </DialogContent>
    </Dialog>
  );
}
