"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  analyticsAvailable,
  analyticsConsent,
  captureAttribution,
  privacySignal,
  setAnalyticsConsent,
  startAnalytics,
  stopAnalytics,
  type AnalyticsConsent,
} from "@/lib/analytics";

export function Analytics() {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    captureAttribution();
    setAvailable(analyticsAvailable());
    setBlocked(privacySignal());
    setOpen(analyticsConsent() === null);
    startAnalytics();
    const sync = () => {
      if (analyticsConsent() === "granted") startAnalytics();
      else stopAnalytics();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  if (!available) return null;
  const choose = (value: AnalyticsConsent) => {
    setAnalyticsConsent(value);
    setOpen(false);
  };
  return (
    <aside
      aria-label="Analytics preferences"
      className="fixed right-3 bottom-3 z-50 max-w-sm rounded-lg bg-background p-3 text-sm text-foreground"
    >
      {open ? (
        <>
          <p>
            Allow Google Analytics to measure feature usage and speed? We exclude resume text, chat
            content, credentials and private thread URLs from our events.
          </p>
          <p className="mt-2 text-muted-foreground">
            {blocked
              ? "Your browser privacy preference keeps analytics off."
              : "Optional. You can change this choice here anytime."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => choose("denied")}>
              No thanks
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={blocked}
              onClick={() => choose("granted")}
            >
              Allow analytics
            </Button>
          </div>
        </>
      ) : (
        <Button variant="text" size="xs" onClick={() => setOpen(true)}>
          Analytics preferences
        </Button>
      )}
    </aside>
  );
}
