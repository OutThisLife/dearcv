import { Defuddle } from "defuddle/node";
import { convert } from "html-to-text";

/**
 * Article extractors answer "what is this page about" by finding the prose and
 * throwing the rest away. That is right for a blog post or a job listing, and
 * useless for a link-index homepage — the kind a lot of portfolios are — where
 * they correctly conclude there is no article and return nothing at all. So
 * Defuddle goes first for the pages it is good at, and a plain whole-document
 * conversion catches the ones it walks away from.
 */
const THIN = 400;

export type Extracted = { title?: string; text: string };

function wholeDocument(html: string) {
  return convert(html, {
    wordwrap: false,
    baseElements: { selectors: ["main", "article", "body"], returnDomByDefault: true },
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "nav", format: "skip" },
      { selector: "footer", format: "skip" },
    ],
  }).trim();
}

export async function extractText(html: string, url: string): Promise<Extracted> {
  let article: Extracted = { text: "" };

  try {
    const parsed = await Defuddle(html, url, { markdown: true });
    article = { title: parsed.title || undefined, text: (parsed.content ?? "").trim() };
  } catch {
    // A page Defuddle cannot parse is not a failure, it just means the whole
    // document is all we get.
  }

  if (article.text.length >= THIN) return article;

  try {
    const whole = wholeDocument(html);
    if (whole.length > article.text.length) return { title: article.title, text: whole };
  } catch {
    // Fall through to whatever the extractor managed.
  }

  return article;
}
