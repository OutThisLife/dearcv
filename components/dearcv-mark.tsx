import { MARK_PATH, MARK_VIEWBOX } from "@/lib/dearcv-artwork";
import { cn } from "@/lib/utils";

/**
 * The DearCV mark. The paper of the document it's holding is negative space in
 * the drawing, so the mark can't take the text color — it carries its own
 * plate, which vanishes into the light page and gives it that paper back on
 * the dark one. Unlabelled, since the wordmark beside it does the naming.
 */
export function DearCvMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("bg-brand-paper grid size-8 shrink-0 place-items-center rounded-md", className)}
    >
      <svg viewBox={MARK_VIEWBOX} className="fill-brand h-6 w-auto">
        <path d={MARK_PATH} />
      </svg>
    </span>
  );
}
