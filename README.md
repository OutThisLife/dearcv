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
