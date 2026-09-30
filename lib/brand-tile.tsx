import { ImageResponse } from "next/og";
import { BRAND, BRAND_PLATE, MARK_PATH, MARK_VIEWBOX } from "@/lib/dearcv-artwork";

const [, , markWidth, markHeight] = MARK_VIEWBOX.split(" ").map(Number);

/**
 * The mark on its own sheet, for the tab and the home screen. The paper in
 * the drawing is negative space, so the mark never stands on a bare
 * background — a dark tab strip would show through as the paper.
 * One plate reads on light and dark alike, so there is one icon, not a pair
 * swapped by colour scheme.
 */
export function markTile(size: number, { rounded }: { rounded: boolean }) {
  // Tall and narrow, so height is what sets the fit.
  const height = Math.round(size * 0.78);
  const width = Math.round((height * markWidth) / markHeight);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BRAND_PLATE,
        borderRadius: rounded ? size * 0.22 : 0,
      }}
    >
      <svg viewBox={MARK_VIEWBOX} width={width} height={height}>
        <path d={MARK_PATH} fill={BRAND} fillRule="evenodd" />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
