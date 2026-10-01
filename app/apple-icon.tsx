import { letterTile } from "@/lib/brand-tile";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return letterTile(size.width);
}
