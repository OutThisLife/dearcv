import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, publicTarget, readCapped, safeFetch } from "../lib/resume/safe-fetch.ts";

test("refuses private and special-use address representations", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:a00:1",
    "64:ff9b::a00:1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "2001::1",
    "3fff::1",
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(isPublicAddress(ip), true, ip);
});

test("rejects URL credentials, protocols, alternate ports and numeric loopback", async () => {
  for (const url of [
    "file:///etc/passwd",
    "http://user:pass@example.com",
    "https://example.com:8443",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::ffff:7f00:1]",
    "http://localhost.",
  ]) {
    await assert.rejects(publicTarget(new URL(url)), Error, url);
  }
  await assert.rejects(safeFetch("http://127.0.0.1"));
});

test("caps even a single oversized response chunk", async () => {
  const text = await readCapped(new Response("a".repeat(3_000_100)));
  assert.equal(text.length, 3_000_000);
});

import {
  sameOriginRequest,
  readJson,
  readBytes,
  RequestBodyError,
} from "../lib/request-security.ts";

test("rejects sibling-domain and foreign-origin requests", () => {
  for (const headers of [
    { origin: "https://evil.example" },
    { "sec-fetch-site": "same-site" },
    { origin: "null" },
    { "sec-fetch-site": "cross-site" },
  ] as Record<string, string>[]) {
    assert.equal(
      sameOriginRequest(new Request("https://www.dearcv.ai/api/upload", { headers })),
      false,
    );
  }
  assert.equal(
    sameOriginRequest(
      new Request("https://www.dearcv.ai/api/upload", {
        headers: { origin: "https://www.dearcv.ai" },
      }),
    ),
    true,
  );
});

test("bounds chunked and declared bodies and handles malformed JSON", async () => {
  const req = new Request("http://local", { method: "POST", body: "a".repeat(101) });
  await assert.rejects(
    readBytes(req, 100),
    (error: unknown) => error instanceof RequestBodyError && error.status === 413,
  );
  await assert.rejects(
    readBytes(new Request("http://local", { headers: { "content-length": "101" } }), 100),
    RequestBodyError,
  );
  await assert.rejects(
    readJson(new Request("http://local", { method: "POST", body: "{" })),
    (error: unknown) => error instanceof RequestBodyError && error.status === 400,
  );
  assert.deepEqual(
    await readJson(new Request("http://local", { method: "POST", body: '{"ok":true}' })),
    { ok: true },
  );
});

import { eventPayload, timingBucket } from "../lib/analytics.ts";

test("analytics strips thread identifiers and excludes callbacks", () => {
  const expected = {
    page_location: "https://www.dearcv.ai/editor",
    page_referrer: "",
    page_title: "DearCV",
  };
  assert.deepEqual(eventPayload("pdf_export_clicked", "/t/secret-thread?token=secret"), expected);
  assert.equal(eventPayload("page_view", "/auth/callback?code=secret"), null);
  assert.equal(eventPayload("sensitive text" as never, "/"), null);
  assert.deepEqual(eventPayload("pdf_rendered", "/t/id", "secret" as never), expected);
  assert.equal(timingBucket(500), "under_1s");
  assert.equal(timingBucket(2000), "1_to_3s");
  assert.equal(timingBucket(45000), "over_30s");
});

import { localAttachmentsOnly } from "../lib/request-security.ts";
test("SDK attachment downloads cannot bypass the public URL guard", async () => {
  await assert.rejects(localAttachmentsOnly([{ url: new URL("http://169.254.169.254/") }]));
  assert.deepEqual(await localAttachmentsOnly([]), []);
});

import { startAnalytics, setAnalyticsConsent, track } from "../lib/analytics.ts";
test("Google tag waits for consent, sends only safe fields, and stops on withdrawal", () => {
  const saved = Object.fromEntries(
    ["window", "document", "localStorage", "navigator"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const oldEnv = { ...process.env };
  const stored = new Map<string, string>();
  const scripts: unknown[] = [];
  const browser = {
    location: { origin: "https://www.dearcv.ai", pathname: "/t/private-id" },
    dataLayer: [] as IArguments[],
  };
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        cookie: "",
        createElement: () => ({}),
        head: { appendChild: (script: unknown) => scripts.push(script) },
      },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { doNotTrack: "0" },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => stored.get(key),
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    });
    Object.assign(process.env, { NODE_ENV: "production" });

    startAnalytics();
    track("pdf_export_clicked");
    assert.equal(scripts.length, 0);
    assert.equal(browser.dataLayer.length, 0);
    setAnalyticsConsent("granted");
    assert.equal(scripts.length, 1);
    track("pdf_export_clicked");
    const events = (browser.dataLayer as unknown as { event?: string }[]).filter(
      (args) => args.event && args.event !== "gtm.js",
    );
    assert.deepEqual(
      events.map((args) => args.event),
      ["page_view", "editor_reopened", "pdf_export_clicked"],
    );
    assert.equal(JSON.stringify(browser.dataLayer).includes("private-id"), false);
    setAnalyticsConsent("denied");
    const length = browser.dataLayer.length;
    track("pdf_export_clicked");
    assert.equal(browser.dataLayer.length, length);
  } finally {
    process.env = oldEnv;
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

import { attribution } from "../lib/analytics.ts";
test("acquisition accepts known campaign labels without leaking arbitrary query values", () => {
  assert.deepEqual(attribution("?utm_source=google&utm_medium=cpc&utm_campaign=launch", ""), {
    campaign_source: "google",
    campaign_medium: "cpc",
    campaign_name: "launch",
  });
  const safe = attribution(
    "?utm_source=someone@example.com&utm_campaign=private-resume&gclid=secret",
    "https://www.linkedin.com/in/private-person",
  );
  assert.deepEqual(safe, {
    campaign_source: "linkedin",
    campaign_medium: "referral",
    campaign_name: "(not set)",
  });
});

import { verifyProviderKey } from "../lib/verify-key.ts";
test("ownership verification rejects invalid keys and unknown provider names", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(null, { status: 401 });
    };
    assert.equal(await verifyProviderKey("openai", "fake-key"), false);
    assert.equal(await verifyProviderKey("anthropic", "fake-key"), false);
    assert.equal(await verifyProviderKey("constructor" as never, "fake-key"), false);
    assert.equal(calls, 2);
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.equal(await verifyProviderKey("openai", "valid-key"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
