# DearCV

Chat on the left. Live PDF resume on the right.

```bash
pnpm install
cp .env.example .env.local   # optional OPENROUTER_API_KEY
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). If no server key is set, the first send opens a connect modal. Upload a PDF to inherit its look, or point the chat at GitHub or a site and start from scratch.

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
