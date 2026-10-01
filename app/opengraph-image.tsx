import { ImageResponse } from "next/og";
import {
  WORDMARK_LEAF_GRADIENT,
  WORDMARK_LEAF_PATH,
  WORDMARK_LEAF_STOPS,
  WORDMARK_PATH,
  WORDMARK_VIEWBOX,
} from "@/lib/dearcv-artwork";

export const alt = "DearCV";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The header's own ink, and the chat pane's paper (--sidebar), so a shared link looks like the app it opens. */
const INK = "#0b0b0b";
const PAPER = "#f9f9f6";

/**
 * The wordmark as the header draws it — ink, with the leaf's gradient — on
 * the chat pane's off-white, which gives the card an edge in a white feed
 * where pure white would vanish. Narrow enough to survive the centred square
 * crop some previews take. The tab icon is cut from the same path.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PAPER,
      }}
    >
      <svg viewBox={WORDMARK_VIEWBOX} width="600" height="130">
        <defs>
          <linearGradient id="leafGrad" {...WORDMARK_LEAF_GRADIENT} gradientUnits="userSpaceOnUse">
            {WORDMARK_LEAF_STOPS.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
        <path d={WORDMARK_PATH} fill={INK} fillRule="evenodd" />
        <path d={WORDMARK_LEAF_PATH} fill="url(#leafGrad)" />
      </svg>
    </div>,
    { ...size },
  );
}
