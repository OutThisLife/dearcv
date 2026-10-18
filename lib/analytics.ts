/** Only these events and coarse timings may leave the editor. */
export const EVENTS = [
  "page_view",
  "editor_reopened",
  "auth_dialog_opened",
  "auth_required",
  "auth_key_started",
  "auth_oauth_started",
  "auth_chatgpt_started",
  "auth_failed",
  "auth_cancelled",
  "provider_connected",
  "provider_disconnected",
  "pdf_picker_opened",
  "pdf_import_started",
  "pdf_import_rejected",
  "pdf_imported",
  "pdf_import_failed",
  "pdf_no_text",
  "resume_transcription_started",
  "resume_transcribed",
  "resume_transcription_failed",
  "message_sent",
  "message_updated",
  "chat_steered",
  "chat_stopped",
  "chat_request",
  "chat_completed",
  "chat_failed",
  "first_reply",
  "resume_edited",
  "resume_edit_failed",
  "pdf_rendered",
  "pdf_render_failed",
  "pdf_export_clicked",
  "history_undo",
  "history_redo",
  "comment_created",
  "comment_replied",
  "comment_resolved",
  "comment_deleted",
  "comment_undo",
  "comment_redo",
  "comment_failed",
  "pdf_stored",
  "pdf_storage_failed",
  "thread_saved",
  "thread_save_failed",
  "voice_input_started",
  "voice_input_stopped",
  "pen_selected",
  "highlighter_selected",
] as const;
export type AnalyticsEvent = (typeof EVENTS)[number];
export type TimingBucket = "under_1s" | "1_to_3s" | "3_to_10s" | "10_to_30s" | "over_30s";
export type AnalyticsConsent = "granted" | "denied";
export const GTM_ID = "GTM-NPCFMW6S";
const CONSENT_KEY = "dearcv.analytics-consent.v1";
const SITE = "https://www.dearcv.ai";
let active = false;
let configured = false;
let pageCounted = false;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function timingBucket(ms: number): TimingBucket {
  return ms < 1000
    ? "under_1s"
    : ms < 3000
      ? "1_to_3s"
      : ms < 10000
        ? "3_to_10s"
        : ms < 30000
          ? "10_to_30s"
          : "over_30s";
}

export function eventPayload(name: AnalyticsEvent, path: string, timing?: TimingBucket) {
  if (!(EVENTS as readonly string[]).includes(name)) return null;
  const page = path === "/" ? "/" : path.startsWith("/t/") ? "/editor" : null;
  if (!page) return null;
  const bucket =
    timing && ["under_1s", "1_to_3s", "3_to_10s", "10_to_30s", "over_30s"].includes(timing)
      ? timing
      : undefined;
  return {
    page_location: `${SITE}${page}`,
    page_referrer: "",
    page_title: "DearCV",
    ...(bucket ? { timing_bucket: bucket } : {}),
  };
}

/** Campaign vocabulary is closed so free-form query values cannot carry PII. */
export function attribution(search: string, referrer: string) {
  const params = new URLSearchParams(search);
  const sources = [
    "google",
    "bing",
    "linkedin",
    "reddit",
    "x",
    "producthunt",
    "hackernews",
    "newsletter",
  ];
  const media = ["organic", "cpc", "paid_social", "social", "email", "referral"];
  const campaigns = ["launch", "search", "referral"];
  const hosts: Record<string, string> = {
    "google.com": "google",
    "www.google.com": "google",
    "bing.com": "bing",
    "www.bing.com": "bing",
    "www.linkedin.com": "linkedin",
    "www.reddit.com": "reddit",
    "t.co": "x",
    "www.producthunt.com": "producthunt",
    "news.ycombinator.com": "hackernews",
  };
  let referral = "";
  try {
    referral = hosts[new URL(referrer).hostname] ?? (referrer ? "external" : "");
  } catch {
    /* No referrer. */
  }
  const source = params.get("utm_source") ?? "";
  const medium = params.get("utm_medium") ?? "";
  const campaign = params.get("utm_campaign") ?? "";
  return {
    campaign_source: sources.includes(source) ? source : referral || "direct",
    campaign_medium: media.includes(medium) ? medium : referral ? "referral" : "(none)",
    campaign_name: campaigns.includes(campaign) ? campaign : "(not set)",
  };
}

let acquisition: ReturnType<typeof attribution> | null = null;
export function captureAttribution() {
  if (typeof window !== "undefined" && !acquisition)
    acquisition = attribution(window.location.search, document.referrer);
}

export function analyticsAvailable() {
  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "production" &&
    window.location.origin === SITE
  );
}

export function privacySignal() {
  return (
    typeof navigator !== "undefined" &&
    (navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true)
  );
}

export function analyticsConsent(): AnalyticsConsent | null {
  if (privacySignal()) return "denied";
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

function gtag(..._args: unknown[]) {
  // Google expects the Arguments object, not a nested array.
  window.dataLayer ??= [];
  window.dataLayer.push(arguments);
}

export function startAnalytics() {
  if (!analyticsAvailable() || analyticsConsent() !== "granted") return;
  captureAttribution();
  active = true;
  if (!configured) {
    configured = true;
    window.gtag = gtag;
    gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    gtag("set", {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: `${SITE}/editor`,
      page_referrer: "",
      page_title: "DearCV",
      cookie_domain: "none",
      cookie_flags: "SameSite=Lax;Secure",
      cookie_expires: 60 * 60 * 24 * 30,
    });
    window.dataLayer!.push({
      ...acquisition,
      ...eventPayload("page_view", window.location.pathname),
      analytics_consent: "granted",
      "gtm.start": Date.now(),
      event: "gtm.js",
    });
    const script = document.createElement("script");
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
    document.head.appendChild(script);
  } else {
    gtag("consent", "update", { analytics_storage: "granted" });
    window.dataLayer!.push({ analytics_consent: "granted" });
  }
  if (!pageCounted) {
    pageCounted = true;
    track("page_view");
    if (window.location.pathname.startsWith("/t/")) track("editor_reopened");
  }
}

export function setAnalyticsConsent(value: AnalyticsConsent) {
  const consent = privacySignal() ? "denied" : value;
  try {
    localStorage.setItem(CONSENT_KEY, consent);
  } catch {
    /* No storage means no collection. */
  }
  if (consent === "granted") {
    startAnalytics();
    return;
  }
  stopAnalytics();
}

export function stopAnalytics() {
  active = false;
  if (typeof window === "undefined") return;
  if (configured) {
    window.dataLayer!.push({ analytics_consent: "denied" });
    gtag("consent", "update", { analytics_storage: "denied" });
  }
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (name === "_ga" || name.startsWith("_ga_")) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
    }
  }
}

export function track(name: AnalyticsEvent, timing?: TimingBucket) {
  if (!active || !analyticsAvailable() || analyticsConsent() !== "granted") return;
  const payload = eventPayload(name, window.location.pathname, timing);
  if (!payload) return;
  window.dataLayer?.push({
    event: name,
    ...payload,
    timing_bucket: "timing_bucket" in payload ? payload.timing_bucket : undefined,
    analytics_consent: "granted",
  });
}
