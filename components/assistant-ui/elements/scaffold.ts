/**
 * Reasoning and tool rows are scaffolding around the answer, not the answer.
 * They stay quiet at rest and come up when you look at them — no cards, no
 * boxes, and they share the prose's left edge.
 */
export const SCAFFOLD_ROW =
  "group/trigger text-muted-foreground flex w-full max-w-full origin-left items-center gap-2 border-0 bg-transparent px-0 py-1 font-sans text-xs opacity-65 shadow-none transition-opacity hover:opacity-100 focus-visible:opacity-100";

/** Sits to the right of the label and only shows on hover or once open. */
export const SCAFFOLD_CARET =
  "size-3 shrink-0 -rotate-90 opacity-0 transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/trigger:opacity-60 group-data-open/trigger:rotate-0 group-data-open/trigger:opacity-60 group-data-panel-open/trigger:rotate-0 group-data-panel-open/trigger:opacity-60 motion-reduce:transition-none";

export const SCAFFOLD_GLYPH = "size-3.5 shrink-0";

/** 16px after prose, 8px between adjacent scaffold lines. */
export const SCAFFOLD_BLOCK = "aui-scaffold mt-4 w-full [.aui-scaffold+&]:mt-2";
