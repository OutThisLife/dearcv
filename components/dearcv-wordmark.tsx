import Link from "next/link";
import {
  WORDMARK_LEAF_GRADIENT,
  WORDMARK_LEAF_PATH,
  WORDMARK_LEAF_STOPS,
  WORDMARK_PATH,
  WORDMARK_VIEWBOX,
} from "@/lib/dearcv-artwork";
import { cn } from "@/lib/utils";

/** Takes its color from the surrounding text so it themes with everything else. */
export function DearCvWordmark({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="DearCV" className="inline-flex">
      <svg
        aria-hidden
        viewBox={WORDMARK_VIEWBOX}
        fill="currentColor"
        fillRule="evenodd"
        className={cn("h-4 w-auto", className)}
      >
        <defs>
          <linearGradient
            id="dearcv-leaf-grad"
            {...WORDMARK_LEAF_GRADIENT}
            gradientUnits="userSpaceOnUse"
          >
            {WORDMARK_LEAF_STOPS.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
        <path d={WORDMARK_PATH} />
        <path d={WORDMARK_LEAF_PATH} fill="url(#dearcv-leaf-grad)" />
      </svg>
    </Link>
  );
}
