import { fetchGithub, githubTarget } from "@/lib/resume/github";
import { extractText } from "@/lib/resume/html-text";
import { readCapped, safeFetch } from "@/lib/resume/safe-fetch";
import { SOURCE_CHARS } from "@/lib/prompts";

const TIMEOUT_MS = 20_000;

/** Below this, try harder for the rest of the page. */
const THIN_TEXT = 500;

/** Below this, there is nothing worth handing to a model. */
const NO_TEXT = 200;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type PageFetch = {
  url: string;
  ok: boolean;
  text: string;
  /** Why it failed, in words the model can repeat to the user. */
  error?: string;
};

const deadline = (signal?: AbortSignal) =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
    : AbortSignal.timeout(TIMEOUT_MS);

async function readDirect(url: string, signal?: AbortSignal): Promise<PageFetch> {
  const res = await safeFetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    signal: deadline(signal),
  });

  if (!res.ok) {
    return { url, ok: false, text: "", error: `The site answered ${res.status}.` };
  }

  const body = await readCapped(res);
  if (/^\s*[[{]/.test(body)) return { url, ok: true, text: body.slice(0, SOURCE_CHARS) };

  const { title, text } = await extractText(body, url);
  return {
    url,
    ok: true,
    text: (title ? `# ${title}\n\n${text}` : text).slice(0, SOURCE_CHARS),
  };
}

/**
 * Jina renders the page first, so it is the way through a client-rendered site.
 * Anonymous use is rate limited by IP and blocks whole ISPs, so it only runs
 * when a key is configured.
 */
async function readViaJina(url: string, key: string, signal?: AbortSignal): Promise<PageFetch> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { accept: "text/plain", authorization: `Bearer ${key}` },
    signal: deadline(signal),
  });

  const text = await readCapped(res);
  if (!res.ok) {
    return { url, ok: false, text: "", error: `The reader service answered ${res.status}.` };
  }
  return { url, ok: true, text: text.slice(0, SOURCE_CHARS) };
}

export async function fetchReadablePage(url: string, signal?: AbortSignal): Promise<PageFetch> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { url, ok: false, text: "", error: "That isn't a URL." };
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return {
      url,
      ok: false,
      text: "",
      error: `Can only read http(s) pages, not ${target.protocol}`,
    };
  }

  // LinkedIn serves logged-out clients a profile with the job titles literally
  // replaced by asterisks, so there is no reader or proxy that gets the work
  // history. Say so up front rather than fetching a page that cannot answer.
  if (/(^|\.)linkedin\.com$/i.test(target.hostname)) {
    return {
      url,
      ok: false,
      text: "",
      error:
        "LinkedIn hides work history from anyone not signed in — the titles come back as asterisks, so no amount of fetching will read it. Tell the user to open their profile on desktop, choose More → Save to PDF, and drop that file into this chat.",
    };
  }

  const key = process.env.JINA_API_KEY;

  try {
    // GitHub answers far better through its API than its markup.
    const github = githubTarget(target);
    if (github) return await fetchGithub(target.toString(), github, signal);

    const direct = await readDirect(target.toString(), signal);
    if (!direct.ok || direct.text.length >= THIN_TEXT) return direct;

    // Short pages are usually drawn by script, and only a renderer sees the
    // rest. Worth a second pass when a key is configured.
    if (key) {
      const rendered = await readViaJina(target.toString(), key, signal);
      if (rendered.ok && rendered.text.length > direct.text.length) return rendered;
    }

    // Keep whatever did come back. Thin is not the same as empty, and throwing
    // away real text because there was not much of it helps nobody.
    if (direct.text.length >= NO_TEXT) return direct;

    return {
      ...direct,
      ok: false,
      error: "That page renders its content with JavaScript, so there was nothing to read.",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      url,
      ok: false,
      text: "",
      error: /abort|timeout/i.test(reason) ? "That page took too long to answer." : reason,
    };
  }
}
