"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as React from "react";

import { cn } from "@/lib/utils";

/** First hover waits so a sweep across chrome does not flash a trail.
 *  Below 150ms a passing cursor still opens; above 250ms a real hover feels broken. */
const TIP_DELAY_MS = 200;

/** After a tip closes, this window stays warm: the next trigger opens instantly
 *  (Base UI `timeout`). Long enough to cover the move between adjacent chrome. */
const TIP_SKIP_DELAY_MS = 300;

/** The tip itself — ink, small type — shared by a lone tip and a group's. */
const SURFACE = "rounded-md bg-foreground text-xs text-background";

const ARROW =
  "z-50 size-2.5 translate-y-[calc(-50%-0.125rem)] rotate-45 rounded-[0.125rem] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5";

function TooltipProvider({
  delay = TIP_DELAY_MS,
  closeDelay = 0,
  timeout = TIP_SKIP_DELAY_MS,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      closeDelay={closeDelay}
      timeout={timeout}
      {...props}
    />
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props<React.ReactNode>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            SURFACE,
            "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 px-3 py-1.5 has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className={ARROW} />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

/** Ties a row of triggers to one shared tip. */
type TooltipGroupHandle = TooltipPrimitive.Handle<React.ReactNode>;

/** A handle for a `TooltipGroup`, made once per component. */
function useTooltipGroup(): TooltipGroupHandle {
  const [handle] = React.useState(() => TooltipPrimitive.createHandle<React.ReactNode>());
  return handle;
}

/**
 * One tip for a whole row of triggers, the way Linear's and Vercel's
 * toolbars do it: moving from one to the next glides the same tip across,
 * resizing as it goes and cross-fading what it says, instead of closing one
 * and popping the next. Each trigger passes `handle` and its words as
 * `payload` (`TooltipIconButton` takes `group`). Motion is assistant-ui's:
 * its curve, 200ms, the words swapping with a fade and a two-pixel nudge
 * toward where the pointer came from.
 */
function TooltipGroup({
  handle,
  side = "top",
  sideOffset = 8,
  className,
}: {
  handle: TooltipGroupHandle;
  side?: TooltipPrimitive.Positioner.Props["side"];
  sideOffset?: number;
  className?: string;
}) {
  return (
    <TooltipPrimitive.Root handle={handle}>
      {({ payload }) => (
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            side={side}
            sideOffset={sideOffset}
            className="ease-aui isolate z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom] duration-200 data-instant:transition-none motion-reduce:transition-none"
          >
            <TooltipPrimitive.Popup
              data-slot="tooltip-content"
              className={cn(
                SURFACE,
                "ease-aui relative h-(--popup-height,auto) w-(--popup-width,auto) max-w-72 origin-(--transform-origin) transition-[width,height,opacity,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none",
                className,
              )}
            >
              <TooltipPrimitive.Viewport
                className={cn(
                  "relative h-full w-full overflow-clip px-(--tip-x) py-1.5 [--tip-x:0.75rem]",
                  "[&_[data-current]]:w-[calc(var(--popup-width)-2*var(--tip-x))] [&_[data-previous]]:w-[calc(var(--popup-width)-2*var(--tip-x))]",
                  "[&_[data-current]]:ease-aui [&_[data-previous]]:ease-aui [&_[data-current]]:transition-[translate,opacity] [&_[data-current]]:duration-200 [&_[data-previous]]:transition-[translate,opacity] [&_[data-previous]]:duration-150",
                  "[&_[data-current][data-starting-style]]:opacity-0 data-[activation-direction~='left']:[&_[data-current][data-starting-style]]:-translate-x-0.5 data-[activation-direction~='right']:[&_[data-current][data-starting-style]]:translate-x-0.5",
                  "[&_[data-previous][data-ending-style]]:opacity-0 data-[activation-direction~='left']:[&_[data-previous][data-ending-style]]:translate-x-0.5 data-[activation-direction~='right']:[&_[data-previous][data-ending-style]]:-translate-x-0.5",
                  "[[data-instant]_&_[data-current]]:transition-none [[data-instant]_&_[data-previous]]:transition-none motion-reduce:[&_[data-current]]:transition-none motion-reduce:[&_[data-previous]]:transition-none",
                )}
              >
                {payload}
              </TooltipPrimitive.Viewport>
              <TooltipPrimitive.Arrow
                className={cn(
                  ARROW,
                  "ease-aui transition-[left,top] duration-200 data-instant:transition-none motion-reduce:transition-none",
                )}
              />
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      )}
    </TooltipPrimitive.Root>
  );
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  TooltipGroup,
  useTooltipGroup,
  type TooltipGroupHandle,
};
