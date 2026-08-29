# DearCV

Chat on the left. Live PDF resume on the right.

```bash
pnpm install
cp .env.example .env.local   # optional OPENROUTER_API_KEY
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). If no server key is set, the first send opens a connect modal (OpenRouter / OpenAI / Anthropic). Upload a PDF to inherit its look, or point the chat at GitHub or a site and start from scratch.

## Sources

GitHub is read through its REST API, so profiles and repositories come back as clean structured text rather than scraped markup. Set `GITHUB_TOKEN` to lift the anonymous rate limit.

Personal sites and portfolios are fetched directly and run through [Defuddle](https://github.com/kepano/defuddle), which finds the prose and drops the navigation. Article extractors return nothing at all on a link-index homepage — they correctly decide there is no article — so anything Defuddle walks away from falls back to a whole-document conversion. Pages that render with JavaScript are unreadable either way and need `JINA_API_KEY`.

LinkedIn is not supported and cannot be. Signed out, LinkedIn replaces every job title on a public profile with asterisks, so there is no reader, proxy, or scraper that returns the work history. The chat asks for the file instead — **More → Save to PDF** on the profile, attached to a message.

## Attachments

The composer takes files. A PDF, a screenshot, or a photo attached to a message is read as context: an old resume, a LinkedIn export, a job posting, a page the fetcher could not reach. This is distinct from dropping a PDF onto the resume itself, which replaces the document and inherits its layout.

The default model reads images natively. PDFs go through OpenRouter's file parser, pinned to the free Cloudflare engine — left unset it falls back to Mistral OCR at $2 per 1000 pages, billed to the account even under BYOK.

Web search is whatever the connected provider runs itself — OpenRouter's, OpenAI's, or Anthropic's. None of it is ours, and it bills to the same key as the rest of the turn.

## What gets stored, and when

A dropped PDF is visible immediately and stored much later. It draws from a local object URL, and nothing leaves the browser until the model has actually answered a turn — not when the file lands, not when the message is sent. A visit that never gets a reply leaves no URL, no row, and no file, which covers the common cases of dropping a resume and thinking better of it, or a first turn dying on a rejected key.

Keeping anything needs a session, since storing something means being able to say whose it is later. Connecting a provider mints one, so it costs a real user nothing. Without one both the file and the row are refused, and the thread still works for as long as the tab is open.

The bucket is private, so a stored PDF has no address of its own. It is read through the thread that owns it, which signs a link good for ten minutes once it has checked who is asking — the same check that guards the page, rather than an unguessable URL sitting outside it.

Nothing is kept forever. A thread that goes seven days untouched is swept overnight, and its files are deleted before its row, because Postgres cannot cascade into object storage and a file that outlives its row is litter nobody will ever look for. That takes the whole folder, not just the current PDF, since a thread that replaced its upload is still holding the one it replaced. A second pass clears files no thread points at at all — an upload whose thread was never saved — sparing anything from the last day, so a file never outruns the row being written for it. `THREAD_RETENTION_DAYS` changes the window; `CRON_SECRET` guards the endpoint, and without it the sweep refuses to run at all. The sweep also keeps the project awake: Supabase pauses a free project after a week without database activity.

`DATABASE_URL` and the Supabase keys are optional. Without them everything lives in memory and a reload starts over.
