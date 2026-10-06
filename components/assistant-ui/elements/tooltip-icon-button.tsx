"use client";

import { type ComponentPropsWithRef, forwardRef } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type TooltipGroupHandle,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
  /** A row's shared tip (`useTooltipGroup`), which glides here instead of this button having its own. */
  group?: TooltipGroupHandle;
};

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ children, tooltip, side = "bottom", group, className, ...rest }, ref) => {
    const trigger = (
      <TooltipTrigger
        handle={group}
        payload={tooltip}
        render={
          <Button
            variant="ghost"
            size="icon"
            {...rest}
            className={cn("aui-button-icon size-6 p-1 active:scale-90", className)}
            ref={ref}
          />
        }
      >
        {children}
        <span className="aui-sr-only sr-only">{tooltip}</span>
      </TooltipTrigger>
    );

    if (group) return trigger;
    return (
      <Tooltip>
        {trigger}
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    );
  },
);

TooltipIconButton.displayName = "TooltipIconButton";
