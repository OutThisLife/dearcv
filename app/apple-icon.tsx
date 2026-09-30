import { markTile } from "@/lib/brand-tile";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Square: iOS rounds the corners itself, and would round a rounded tile twice. */
export default function AppleIcon() {
  return markTile(size.width, { rounded: false });
}
