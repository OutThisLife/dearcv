import { ImageResponse } from "next/og";
import {
  WORDMARK_LEAF_GRADIENT,
  WORDMARK_LEAF_PATH,
  WORDMARK_LEAF_STOPS,
  WORDMARK_PATH,
} from "@/lib/dearcv-artwork";

/**
 * The wordmark's D, leaf and all: the logo people actually see in the
 * header. The whole wordmark is drawn and the view cut to the D, so the
 * letter can never drift from the header's. Square and centred on the
 * letter, stopping short of the "e", which starts at x=350.
 */
const D_VIEWBOX = "89 486.5 260 260";

/** The header's own ink, light and dark. */
const INK = { light: "#0b0b0b", dark: "#ededed" } as const;

const { x1, y1, x2, y2 } = WORDMARK_LEAF_GRADIENT;
const leaf = `<linearGradient id="leaf" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">${WORDMARK_LEAF_STOPS.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`).join("")}</linearGradient>`;

const letter = (ink: string, style = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${D_VIEWBOX}">${style}<defs>${leaf}</defs><path class="ink" fill="${ink}" fill-rule="evenodd" d="${WORDMARK_PATH}"/><path fill="url(#leaf)" d="${WORDMARK_LEAF_PATH}"/></svg>`;

/**
 * For the tab: bare, like the wordmark, and inked for the browser's own
 * scheme from inside the file, so a dark tab strip gets the light D the dark
 * header shows. Nothing is swapped by script.
 */
export const letterSvg = () =>
  letter(INK.light, `<style>@media (prefers-color-scheme:dark){.ink{fill:${INK.dark}}}</style>`);

/**
 * For the home screen, which wants a full square of its own: the D on white,
 * as it sits in the header. iOS rounds the corners itself.
 */
export function letterTile(size: number) {
  const glyph = Math.round(size * 0.66);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
      }}
    >
      <img
        src={`data:image/svg+xml,${encodeURIComponent(letter(INK.light))}`}
        width={glyph}
        height={glyph}
        alt=""
      />
    </div>,
    { width: size, height: size },
  );
}
