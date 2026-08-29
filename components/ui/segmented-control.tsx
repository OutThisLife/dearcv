"use client";

import { cn } from "@/lib/utils";

export type SegmentedControlOption<T extends string> = {
  id: T;
  label: string;
};

/**
 * Grouped one-row toggle for small mutually-exclusive choices. Flat by design —
 * no per-option borders, just a tinted track with a raised active pill.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5",
        className,
      )}
    >
      {options.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "cursor-pointer rounded-[min(var(--radius-md),0.5rem)] px-2.5 py-1 font-sans text-xs font-medium transition-colors",
            value === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
