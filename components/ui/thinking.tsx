"use client";

import { GlyphSpinner } from "@/components/ui/glyph-spinner";
import { cn } from "@/lib/utils";

function Thinking({
  className,
  label,
  large,
}: {
  className?: string;
  label?: string;
  large?: boolean;
}) {
  return (
    <span data-slot="thinking" className={cn("inline-flex items-center gap-2", className)}>
      <GlyphSpinner
        ariaLabel={label ?? "Loading"}
        className={cn("shrink-0", large ? "text-2xl" : "text-xs")}
      />
      {label && <span className="text-muted-foreground font-sans text-xs">{label}</span>}
    </span>
  );
}

export { Thinking };
