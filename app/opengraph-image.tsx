import { ImageResponse } from "next/og";
import {
  MARK_PATH,
  MARK_VIEWBOX,
  WORDMARK_LEAF_PATH,
  WORDMARK_PATH,
  WORDMARK_VIEWBOX,
} from "@/lib/dearcv-artwork";

export const alt = "DearCV";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const brand = "#8b5239";
const leaf = "#d4657f";

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
        backgroundImage:
          "radial-gradient(circle at 50% 42%, #f5eee4 0%, #efe6d4 42%, #e4d4be 100%)",
      }}
    >
      <svg viewBox={MARK_VIEWBOX} width="128" height="186">
        <path d={MARK_PATH} fill={brand} fillRule="evenodd" />
      </svg>
      <svg viewBox={WORDMARK_VIEWBOX} width="420" height="100" style={{ marginTop: 36 }}>
        <path d={WORDMARK_PATH} fill={brand} fillRule="evenodd" />
        <path d={WORDMARK_LEAF_PATH} fill={leaf} />
      </svg>
    </div>,
    { ...size },
  );
}
