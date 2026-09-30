import { markTile } from "@/lib/brand-tile";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return markTile(size.width, { rounded: true });
}
