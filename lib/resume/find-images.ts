import { tool } from "ai";
import { z } from "zod";

/**
 * Pictures to put on a resume, found on the open web. Two catalogues, both
 * free and keyless:
 *
 * - Iconify: some 275,000 open-source icons, logos and emoji, as SVG — so a
 *   rocket, a company's logo or a sticker prints as crisp vectors. Colour sets
 *   (Fluent emoji, Noto, logos) come as they are; one-colour ones take the
 *   piece's colour.
 * - Openverse: Creative Commons photos and illustrations, for something real.
 *
 * Either answer's `url` goes straight into a piece's `image`.
 */

const TIMEOUT_MS = 10_000;

/** Full-colour sets first: they read as illustrations, not as UI chrome. */
const COLOUR_SETS = [
  "fluent-emoji-flat",
  "noto",
  "twemoji",
  "openmoji",
  "streamline-emojis",
  "flat-color-icons",
  "streamline-plump-color",
  "logos",
  "skill-icons",
  "devicon",
];

type IconSearch = {
  icons?: string[];
  collections?: Record<string, { name?: string; license?: { title?: string; spdx?: string } }>;
};

async function searchIcons(query: string, kind: "color" | "line" | "logo", limit: number) {
  const params = new URLSearchParams({ query, limit: String(Math.max(limit, 32)) });
  if (kind === "color") params.set("prefixes", COLOUR_SETS.join(","));
  if (kind === "logo") params.set("prefixes", "logos,simple-icons,devicon,skill-icons");
  if (kind === "line") params.set("palette", "false");
  const res = await fetch(`https://api.iconify.design/search?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The icon search answered ${res.status}.`);
  const data = (await res.json()) as IconSearch;
  const icons = data.icons ?? [];
  // One of each name, so the model sees variety rather than six weights of one rocket.
  const seen = new Set<string>();
  return icons
    .filter((icon) => {
      const name = icon.split(":")[1] ?? icon;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .slice(0, limit)
    .map((icon) => {
      const [set] = icon.split(":");
      const collection = data.collections?.[set!];
      return {
        url: `https://api.iconify.design/${icon.replace(":", "/")}.svg`,
        name: icon,
        kind: "vector",
        set: collection?.name ?? set,
        license: collection?.license?.spdx ?? collection?.license?.title,
        // A one-colour set draws in currentColor, which the piece's colour fills.
        takesColour: kind === "line",
      };
    });
}

type OpenverseResult = {
  title?: string;
  url?: string;
  thumbnail?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  foreign_landing_url?: string;
  width?: number;
  height?: number;
};

async function searchPhotos(query: string, limit: number) {
  const params = new URLSearchParams({
    q: query,
    page_size: String(limit),
    license_type: "commercial",
    mature: "false",
  });
  const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: { "user-agent": "DearCV (https://brooklyn.sh)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The photo search answered ${res.status}.`);
  const data = (await res.json()) as { results?: OpenverseResult[] };
  return (data.results ?? []).flatMap((result) =>
    result.url
      ? [
          {
            url: result.url,
            name: result.title ?? "Untitled",
            kind: "photo",
            size: result.width && result.height ? `${result.width}×${result.height}` : undefined,
            credit: [
              result.creator ? `by ${result.creator}` : "",
              result.license
                ? `CC ${result.license.toUpperCase()} ${result.license_version ?? ""}`.trim()
                : "",
            ]
              .filter(Boolean)
              .join(", "),
            page: result.foreign_landing_url,
          },
        ]
      : [],
  );
}

export const findImages = tool({
  description:
    "Search the open web for pictures to put on the resume: icons, logos, emoji-style stickers and illustrations as SVG (Iconify, ~275k open-source icons), or Creative Commons photos (Openverse). Put a result's url in a piece's `image` with place_art. Prefer this over drawing a recognisable thing from scratch, and over generate_image when something stock will do.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("What to look for, in a word or two: 'banana', 'rocket', 'stripe logo'."),
    kind: z
      .enum(["sticker", "icon", "logo", "photo"])
      .default("sticker")
      .describe(
        "sticker: full-colour illustration or emoji · icon: one-colour line icon that takes a colour · logo: a company's or a technology's mark · photo: a real photograph or painting.",
      ),
    limit: z.number().int().min(1).max(12).default(6),
  }),
  execute: async ({ query, kind, limit }) => {
    try {
      const results =
        kind === "photo"
          ? await searchPhotos(query, limit)
          : await searchIcons(
              query,
              kind === "sticker" ? "color" : kind === "logo" ? "logo" : "line",
              limit,
            );
      if (!results.length)
        return { query, results, note: "Nothing found. Try a simpler word, or another kind." };
      return {
        query,
        results,
        note:
          kind === "photo"
            ? "Photos need credit: put the credit and page in the piece's `source`."
            : "Vector: prints crisp at any size. A one-colour icon takes the piece's `color`.",
      };
    } catch (error) {
      return { query, results: [], error: error instanceof Error ? error.message : String(error) };
    }
  },
});
