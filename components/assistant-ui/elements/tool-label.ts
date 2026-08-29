const LABELS: Record<string, string> = {
  fetch_url: "Read a page",
  get_resume: "Read resume",
  remove_item: "Removed a role",
  remove_section: "Removed a section",
  update_basics: "Updated the header",
  update_resume: "Updated the resume",
  update_theme: "Changed the look",
  upsert_item: "Updated a role",
  upsert_section: "Updated a section",
  web_search: "Searched the web",
};

const SITES: Record<string, string> = {
  "bsky.app": "Bluesky",
  "gist.github.com": "GitHub",
  "github.com": "GitHub",
  "linkedin.com": "LinkedIn",
  "medium.com": "Medium",
  "notion.so": "Notion",
  "notion.site": "Notion",
  "twitter.com": "X",
  "x.com": "X",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function argsOf(args?: unknown, argsText?: string) {
  const fromArgs = asRecord(args);
  if (fromArgs) return fromArgs;
  if (!argsText) return null;
  try {
    return asRecord(JSON.parse(argsText));
  } catch {
    return null;
  }
}

function siteName(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SITES[host] ?? host;
  } catch {
    return null;
  }
}

function field(args: Record<string, unknown> | null, ...keys: string[]) {
  if (!args) return null;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Visual only — the model still sees the real tool name. */
export function toolLabel(name: string, args?: unknown, argsText?: string) {
  const parsed = argsOf(args, argsText);

  if (name === "fetch_url") {
    const site = field(parsed, "url");
    const label = site ? siteName(site) : null;
    return label ? `Read ${label}` : LABELS.fetch_url;
  }

  if (name === "web_search") {
    const query = field(parsed, "query", "q", "search");
    if (query && query.length <= 40) return `Looked up “${query}”`;
    return LABELS.web_search;
  }

  if (LABELS[name]) return LABELS[name];

  const spaced = name.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : name;
}
