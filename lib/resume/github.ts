import type { PageFetch } from "@/lib/resume/fetch-page";

/**
 * GitHub's public REST API instead of its HTML. The profile page is a quarter
 * of a megabyte of markup that says less than four JSON calls do, and the API
 * needs no key for public data — 60 requests an hour, or 5000 with a token.
 */
const API = "https://api.github.com";
const TIMEOUT_MS = 15_000;
const TOP_REPOS = 12;
const README_CHARS = 4000;

type Repo = {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  topics?: string[];
  homepage: string | null;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
};

type Profile = {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  followers: number;
  public_repos: number;
  created_at: string;
};

/** github.com/<login>, or github.com/<owner>/<repo>. Anything deeper is a page, not a profile. */
export function githubTarget(url: URL) {
  if (!/^(www\.)?github\.com$/i.test(url.hostname)) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const reserved = ["orgs", "topics", "features", "about", "pricing", "settings", "sponsors"];
  if (!parts.length || reserved.includes(parts[0].toLowerCase())) return null;

  if (parts.length === 1) return { login: parts[0] };
  if (parts.length === 2) return { login: parts[0], repo: parts[1] };
  return null;
}

async function api<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`${API}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(token && { authorization: `Bearer ${token}` }),
    },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
      : AbortSignal.timeout(TIMEOUT_MS),
  });

  if (res.status === 403 || res.status === 429) {
    throw new Error("GitHub is rate limiting anonymous requests. Try again shortly.");
  }
  return res.ok ? ((await res.json()) as T) : null;
}

async function readme(login: string, repo: string, signal?: AbortSignal) {
  const found = await api<{ content?: string }>(`/repos/${login}/${repo}/readme`, signal);
  if (!found?.content) return "";

  const text = Buffer.from(found.content, "base64").toString("utf8");
  // Badge soup and comments carry nothing a resume can use.
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, README_CHARS);
}

const repoLine = (repo: Repo) =>
  [
    `- ${repo.name}`,
    repo.description && `— ${repo.description}`,
    repo.language && `[${repo.language}]`,
    repo.stargazers_count > 0 && `${repo.stargazers_count} stars`,
    repo.topics?.length && `topics: ${repo.topics.join(", ")}`,
    repo.homepage && `site: ${repo.homepage}`,
    repo.archived && "(archived)",
    `last pushed ${repo.pushed_at.slice(0, 7)}`,
  ]
    .filter(Boolean)
    .join(" ");

export async function fetchGithub(
  url: string,
  target: { login: string; repo?: string },
  signal?: AbortSignal,
): Promise<PageFetch> {
  const fail = (error: string): PageFetch => ({ url, ok: false, text: "", error });

  if (target.repo) {
    const repo = await api<Repo>(`/repos/${target.login}/${target.repo}`, signal);
    if (!repo) return fail("No public repository at that address.");

    const body = await readme(target.login, target.repo, signal);
    return {
      url,
      ok: true,
      text: `GitHub repository ${target.login}/${target.repo}\n${repoLine(repo)}\n\nREADME:\n${body}`,
    };
  }

  const profile = await api<Profile>(`/users/${target.login}`, signal);
  if (!profile) return fail("No public GitHub user at that address.");

  const repos =
    (await api<Repo[]>(`/users/${target.login}/repos?per_page=100&type=owner`, signal)) ?? [];
  const notable = repos
    .filter((repo) => !repo.fork)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, TOP_REPOS);

  const orgs = (await api<{ login: string }[]>(`/users/${target.login}/orgs`, signal)) ?? [];
  const about = await readme(target.login, target.login, signal);

  const facts = [
    profile.name && `Name: ${profile.name}`,
    `GitHub: @${profile.login} (since ${profile.created_at.slice(0, 4)}, ${profile.followers} followers)`,
    profile.bio && `Bio: ${profile.bio}`,
    profile.company && `Company: ${profile.company}`,
    profile.location && `Location: ${profile.location}`,
    profile.blog && `Site: ${profile.blog}`,
    orgs.length && `Organizations: ${orgs.map((org) => org.login).join(", ")}`,
  ].filter(Boolean);

  const languages = [...new Set(notable.map((repo) => repo.language).filter(Boolean))];

  return {
    url,
    ok: true,
    text: [
      facts.join("\n"),
      languages.length && `Languages in use: ${languages.join(", ")}`,
      notable.length &&
        `\nNotable public repositories (${profile.public_repos} total):\n${notable.map(repoLine).join("\n")}`,
      about && `\nProfile README:\n${about}`,
      // Say what is missing so the model asks instead of inventing it.
      "\nNote: GitHub carries no employment history — no employers, titles, or dates. Ask the user for those.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
