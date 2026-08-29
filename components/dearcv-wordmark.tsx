import Link from "next/link";
import { WORDMARK_LEAF_PATH, WORDMARK_PATH, WORDMARK_VIEWBOX } from "@/lib/dearcv-artwork";
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
        <path d={WORDMARK_PATH} />
        {/* The leaf keeps its own color while the letters follow the text. */}
        <path d={WORDMARK_LEAF_PATH} className="fill-brand-leaf" />
      </svg>
    </Link>
  );
}
