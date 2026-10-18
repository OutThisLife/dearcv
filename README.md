# DearCV

Chat on the left. Live PDF resume on the right.

```bash
pnpm install
cp .env.example .env.local   # optional OPENROUTER_API_KEY
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The server key is available only in local development. Production requires the visitor to connect a provider; the first send opens a connect modal. Upload a PDF to inherit its look, or point the chat at GitHub or a site and start from scratch.

## Connecting

**Continue with ChatGPT** runs on the person's own ChatGPT plan through OpenAI's [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source). Locally it needs nothing set up: the first sign-in registers a client for that account, which later sign-ins reuse. OpenAI's open-source flow only calls back to `127.0.0.1`, so it works there and not on `localhost` — the modal offers to reopen the page at the right address. A deployment needs a client ID of its own, which OpenAI issues through its [interest form](https://openai.com/form/sign-in-with-chatgpt-interest/); register `https://<your-domain>/auth/chatgpt` as its callback and set `OPENAI_OAUTH_CLIENT_ID`. Until then the button doesn't show there.

The tokens never reach the page. They're sealed into two httpOnly cookies — the refresh token's scoped to the routes that spend it — and renewed an hour at a time. The model is the smallest one the account's own catalog lists.

**Continue with OpenRouter** mints an OpenRouter key over OAuth. **Or paste a key** takes an OpenRouter, OpenAI, or Anthropic key, with a link to where each one is made.

There's no Claude sign-in, and there won't be one: Anthropic doesn't let other apps offer Claude.ai login or spend Pro and Max plans, and enforces it. An Anthropic key from the [Claude Console](https://platform.claude.com/settings/keys) is the way in.

## Sources

GitHub is read through its REST API, so profiles and repositories come back as clean structured text rather than scraped markup. Set `GITHUB_TOKEN` to lift the anonymous rate limit.

Personal sites and portfolios are fetched directly and run through [Defuddle](https://github.com/kepano/defuddle), which finds the prose and drops the navigation. Article extractors return nothing at all on a link-index homepage — they correctly decide there is no article — so anything Defuddle walks away from falls back to a whole-document conversion. Pages that render with JavaScript are unreadable either way and need `JINA_API_KEY`.

LinkedIn is not supported and cannot be. Signed out, LinkedIn replaces every job title on a public profile with asterisks, so there is no reader, proxy, or scraper that returns the work history. The chat asks for the file instead — **More → Save to PDF** on the profile, attached to a message.

## Attachments

The composer takes files. A PDF, a screenshot, or a photo attached to a message is read as context: an old resume, a LinkedIn export, a job posting, a page the fetcher could not reach. The one exception is a PDF attached while nothing is open yet — that is almost always their resume, so it opens beside the chat exactly as a drop onto the resume would, replacing the document and inheriting its layout.

The default model reads images natively. PDFs go through OpenRouter's file parser, pinned to the free Cloudflare engine — left unset it falls back to Mistral OCR at $2 per 1000 pages, billed to the account even under BYOK.

Web search is whatever the connected provider runs itself — OpenRouter's, OpenAI's, or Anthropic's. None of it is ours, and it bills to the same key as the rest of the turn.

## Keeping the look

An uploaded resume is transcribed once, in the background, and every chat turn waits for that rather than asking the model to copy it out. Then its look is read off the page: `read-pdf.ts` keeps every run of text with its face, size, weight, colour and position, plus the rules and drawn bullets; `measure-typeset.ts` finds the transcription's name, headings, companies, roles, dates and bullets on that page and records how each kind was set — which lines are bold, the rule under a heading, the bullet glyph and indents, where dates sit, the gaps between things, the margins. Rendering only ever reads that typeset; a resume started from scratch gets one built from the theme's presets. The model never sees it, and a restyle it asks for lands on top of it.

Faces are matched to open ones in `public/fonts` — metric twins of Georgia, Times, Arial, Calibri and Cambria, so lines break where they broke. Two patches to react-pdf keep it honest: ragged text breaks greedily the way Word and browsers do instead of Knuth–Plass squeezing spaces, and a top margin at an unforced page break is dropped, as CSS does.

Sending while a reply is still running steers it: the reply stops where it is, and the new message goes out with everything so far in view.

## What gets stored, and when

A dropped PDF is visible immediately and stored much later. It draws from a local object URL, and nothing leaves the browser until the model has actually answered a turn — not when the file lands, not when the message is sent. A visit that never gets a reply leaves no URL, no row, and no file, which covers the common cases of dropping a resume and thinking better of it, or a first turn dying on a rejected key.

Keeping anything needs a session, since storing something means being able to say whose it is later. Connecting a provider mints one, so it costs a real user nothing. Without one both the file and the row are refused, and the thread still works for as long as the tab is open.

The bucket is private, so a stored PDF has no address of its own. It is read through the thread that owns it, which signs a link good for ten minutes once it has checked who is asking — the same check that guards the page, rather than an unguessable URL sitting outside it.

Nothing is kept forever. A thread that goes seven days untouched is swept overnight, and its files are deleted before its row, because Postgres cannot cascade into object storage and a file that outlives its row is litter nobody will ever look for. That takes the whole folder, not just the current PDF, since a thread that replaced its upload is still holding the one it replaced. A second pass clears files no thread points at at all — an upload whose thread was never saved — sparing anything from the last day, so a file never outruns the row being written for it. `THREAD_RETENTION_DAYS` changes the window; `CRON_SECRET` guards the endpoint, and without it the sweep refuses to run at all. The sweep also keeps the project awake: Supabase pauses a free project after a week without database activity.

`DATABASE_URL` and the Supabase keys are optional. Without them everything lives in memory and a reload starts over.

## Security and production configuration

Production API requests require `DATABASE_URL` and an `AUTH_SECRET` of at least
32 characters. Apply `db/schema.sql` before deploying the server changes; the
Vercel build command already does this. It adds the shared `request_quotas`
table. Model requests are limited to 30 per minute per network address, upload
URL requests to 10, and other API requests to 180. These are fixed windows, so
a burst can straddle a boundary. On Vercel the key uses its overwritten
`x-vercel-forwarded-for` header; self-hosted installations share one quota
rather than trusting a spoofable forwarding header. Add trusted edge limits
for self-hosted public traffic. Quotas fail closed on database errors.

Hosted model keys are no longer available to anonymous callers. OpenAI and
Anthropic keys must pass a provider probe before they can mint an ownership
session. Thread writes require an owner; uploads reserve the thread atomically
before issuing a storage capability. Old rows with no owner are now inaccessible
through the app. Do not assign them to the first visitor: recover them only after
independently establishing ownership, or let the retention sweep remove them.
An attached picture can reserve a thread before a reply arrives.

URL fetching checks every redirect, pins the connection to the validated IP,
and rejects local/special-use IPv4 and IPv6 addresses. Remote attachment URLs
cannot trigger the model SDK's separate download path. Request bodies are
bounded while streaming; malformed JSON returns a controlled error. Cross-site
and sibling-domain API requests are rejected. Response headers prevent framing
and referrer leakage. The CSP currently restricts framing, objects and base URLs;
it is not a complete script allowlist.

Before public rollout, verify the private bucket and database policies, configure
`CRON_SECRET`, and exercise sign-in, upload, reopen, and expiry on a staging
deployment. Confirm that database credentials cannot read unrelated projects.
Dependency checks and local regression tests do not replace a production audit.
Pasted provider keys still live in browser localStorage; moving them to sealed
server cookies remains a separate hardening step. Assets retain the existing
per-thread byte cap; a verified account can still create multiple threads, so
account-wide storage quotas and infrastructure spend alerts remain necessary
for a large public launch.

Run the focused regression tests with Node 22.18+:

```sh
node --test tests/security.test.ts
```

## Google Analytics 4

Production uses GTM **GTM-NPCFMW6S** and GA4 **G-LS8XNVMXXZ** (property
559522463). The Google tag, event tag, consent trigger and eight Data Layer
Variables are published. GA4 Enhanced Measurement and GTM automatic event
detection are off, as are user-provided data collection and Google Signals.

The app loads GTM only on `https://www.dearcv.ai`, after explicit consent.
DNT and Global Privacy Control keep it off. Local and preview hosts do not
load analytics. Withdrawal stops app events, changes consent to denied and
clears host-only GA cookies. Google still receives ordinary network metadata
when a visitor opts in; browser blockers can prevent delivery.

The Google tag initializes with `send_page_view=false`,
`allow_google_signals=false`, `allow_ad_personalization_signals=false`,
`cookie_domain=none`, `cookie_flags=SameSite=Lax;Secure`, and
`cookie_expires=2592000`. The app sets these before loading the container.
The event tag uses `{{Event}}` and requires `analytics_consent=granted`.
Its exact regex allowlist matches `EVENTS` in `lib/analytics.ts`; update both
when adding an event. Never replace it with a wildcard or automatic click/form
listener, and do not add a noscript iframe that bypasses opt-in.

Data Layer Variables (version 2) forward `page_location`, `page_referrer`,
`page_title`, `timing_bucket`, `campaign_source`, `campaign_medium` and
`campaign_name`; `analytics_consent` gates the trigger. Page locations are
only `/` or `/editor`, referrers are empty and titles are fixed. Resume text,
chat content, filenames, credentials, thread IDs, comment IDs and error messages
are never analytics parameters. Restrict publishing access to GTM: a new tag
could bypass these application-level rules.

Acquisition uses a closed vocabulary: sources `google`, `bing`, `linkedin`,
`reddit`, `x`, `producthunt`, `hackernews`, `newsletter`; media `organic`, `cpc`,
`paid_social`, `social`, `email`, `referral`; campaigns `launch`, `search`,
`referral`. Recognized referrer hosts become source labels; other hosts become
`external`. Unknown query values and click IDs are discarded. Extend this
vocabulary before launching a differently named campaign.

| Area             | Events                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry            | `page_view`, `editor_reopened`                                                                                                                                                          |
| Connection       | `auth_dialog_opened`, `auth_required`, `auth_key_started`, `auth_oauth_started`, `auth_chatgpt_started`, `auth_failed`, `auth_cancelled`, `provider_connected`, `provider_disconnected` |
| Import           | `pdf_picker_opened`, `pdf_import_started`, `pdf_import_rejected`, `pdf_imported`, `pdf_import_failed`, `pdf_no_text`                                                                    |
| Transcription    | `resume_transcription_started`, `resume_transcribed`, `resume_transcription_failed`                                                                                                     |
| Conversation     | `message_sent`, `message_updated`, `chat_steered`, `chat_stopped`, `chat_request`, `chat_completed`, `chat_failed`, `first_reply`                                                       |
| Editing          | `resume_edited`, `resume_edit_failed`, `history_undo`, `history_redo`, `pen_selected`, `highlighter_selected`                                                                           |
| Comments         | `comment_created`, `comment_replied`, `comment_resolved`, `comment_deleted`, `comment_undo`, `comment_redo`, `comment_failed`                                                           |
| Rendering/export | `pdf_rendered`, `pdf_render_failed`, `pdf_export_clicked`                                                                                                                               |
| Persistence      | `pdf_stored`, `pdf_storage_failed`, `thread_saved`, `thread_save_failed`                                                                                                                |
| Dictation        | `voice_input_started`, `voice_input_stopped`                                                                                                                                            |

`message_sent` measures user submissions; `chat_request` includes automatic
model/tool continuations. `chat_completed` excludes aborted or failed responses.
`provider_connected` excludes credential refreshes. `resume_edited` includes
agent edits and completed pen/highlighter strokes, not replayed tool calls.
Thread-save events record the first success, failure transitions and recovery,
not every autosave. `pdf_imported` means text extraction completed; `pdf_no_text`
identifies scans that still need user input. `pdf_export_clicked` means the
browser was asked to download a PDF, not proof that it reached disk.

`pdf_export_clicked` is a GA4 key event counted once per session, with no
invented monetary value. Use `first_reply` and `resume_edited` as activation
steps, then export as the success step. Compare new and returning editors,
connection/import drop-off, failure rates, and export rate by acquisition
source. Abandonment is inferred from missing later funnel steps; tab-close
telemetry is unreliable. This measures consenting visitors, not every visitor.

Import, transcription, render and chat timings use five buckets: `under_1s`,
`1_to_3s`, `3_to_10s`, `10_to_30s`, `over_30s`. The event-scoped GA4 custom
dimension **Timing bucket** maps to `timing_bucket`.

Validation on production confirmed no Google requests before consent, a GA4
`page_view` collection response of HTTP 204 after consent, and no subsequent
custom event or GA cookies after withdrawal. Recheck in a clean browser after
changing GTM. Google's reporting UI can lag receipt; local tests verify payload
sanitization and consent logic, not delivery. Already loaded Google tags are
also governed by GTM settings; Consent Mode alone can allow cookieless pings.
