import { letterSvg } from "@/lib/brand-tile";

export const contentType = "image/svg+xml";

export default function Icon() {
  return new Response(letterSvg(), { headers: { "content-type": contentType } });
}
