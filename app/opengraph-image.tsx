import { ImageResponse } from "next/og";
import {
  BRAND,
  MARK_PATH,
  MARK_VIEWBOX,
  WORDMARK_LEAF_GRADIENT,
  WORDMARK_LEAF_PATH,
  WORDMARK_LEAF_STOPS,
  WORDMARK_PATH,
  WORDMARK_VIEWBOX,
} from "@/lib/dearcv-artwork";

export const alt = "DearCV";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#efe6d4",
      }}
    >
      <svg viewBox={MARK_VIEWBOX} width="160" height="233">
        <path d={MARK_PATH} fill={BRAND} fillRule="evenodd" />
      </svg>
      <svg viewBox={WORDMARK_VIEWBOX} width="520" height="113" style={{ marginTop: 32 }}>
        <defs>
          <linearGradient id="leafGrad" {...WORDMARK_LEAF_GRADIENT} gradientUnits="userSpaceOnUse">
            {WORDMARK_LEAF_STOPS.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
        <path d={WORDMARK_PATH} fill={BRAND} fillRule="evenodd" />
        <path d={WORDMARK_LEAF_PATH} fill="url(#leafGrad)" />
      </svg>
    </div>,
    { ...size },
  );
}
