const STORAGE_KEY = "dear-cv.composer-drafts";
const NEW_DRAFT_KEY = "__new__";
const MAX_DRAFTS = 50;

function draftKey(id: string, addressed: boolean) {
  return addressed && id ? id : NEW_DRAFT_KEY;
}

function readDrafts(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDrafts(drafts: Record<string, string>) {
  try {
    const entries = Object.entries(drafts)
      .filter(([, text]) => text)
      .slice(-MAX_DRAFTS);
    if (entries.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Quota / private mode must not break typing.
  }
}

export function takeComposerDraft(id: string, addressed: boolean) {
  return readDrafts()[draftKey(id, addressed)] ?? "";
}

export function stashComposerDraft(id: string, addressed: boolean, text: string) {
  const key = draftKey(id, addressed);
  const drafts = readDrafts();
  if (text) drafts[key] = text;
  else delete drafts[key];
  writeDrafts(drafts);
}

export function clearComposerDraft(id: string, addressed: boolean) {
  stashComposerDraft(id, addressed, "");
}

/** The home composer is `__new__` until the thread gets a URL. */
export function migrateComposerDraft(id: string) {
  if (!id) return;
  const drafts = readDrafts();
  const text = drafts[NEW_DRAFT_KEY];
  if (!text || drafts[id]) return;
  delete drafts[NEW_DRAFT_KEY];
  drafts[id] = text;
  writeDrafts(drafts);
}
