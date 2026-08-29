"use client";

import { memo, useCallback, useRef, useState, type FC, type PropsWithChildren } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { useScrollLock } from "@assistant-ui/react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Thinking } from "@/components/ui/thinking";

import { SCAFFOLD_BLOCK, SCAFFOLD_CARET, SCAFFOLD_ROW } from "./scaffold";

const ANIMATION_DURATION = 200;

const toolGroupVariants = cva(`aui-tool-group-root group/tool-group ${SCAFFOLD_BLOCK}`, {
  variants: {
    variant: {
      outline: "rounded-lg border py-3",
      ghost: "",
      muted: "border-muted-foreground/30 bg-muted/30 rounded-lg border py-3",
    },
  },
  // Flat by default, to match the individual tool and reasoning rows.
  defaultVariants: { variant: "ghost" },
});

export type ToolGroupRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> &
  VariantProps<typeof toolGroupVariants> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
  };

function ToolGroupRoot({
  className,
  variant,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolGroupRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      lockScroll();
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [lockScroll, isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot="tool-group-root"
      data-variant={variant ?? "ghost"}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(toolGroupVariants({ variant }), "group/tool-group-root", className)}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

function ToolGroupTrigger({
  count,
  active = false,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
  active?: boolean;
}) {
  const label = active ? "Updating" : count === 1 ? "Updated" : `${count} updates`;

  return (
    <CollapsibleTrigger
      data-slot="tool-group-trigger"
      className={cn(
        SCAFFOLD_ROW,
        "aui-tool-group-trigger",
        "group-data-[variant=outline]/tool-group-root:w-full group-data-[variant=outline]/tool-group-root:px-4",
        "group-data-[variant=muted]/tool-group-root:w-full group-data-[variant=muted]/tool-group-root:px-4",
        className,
      )}
      {...props}
    >
      <span
        data-slot="tool-group-trigger-label"
        className={cn(
          "aui-tool-group-trigger-label-wrapper inline-block text-start leading-none",
          "group-data-[variant=outline]/tool-group-root:grow",
          "group-data-[variant=muted]/tool-group-root:grow",
        )}
      >
        {label}
      </span>
      {active && <Thinking />}
      <ChevronDownIcon
        data-slot="tool-group-trigger-chevron"
        className={cn("aui-tool-group-trigger-chevron", SCAFFOLD_CARET)}
      />
    </CollapsibleTrigger>
  );
}

function ToolGroupContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-group-content"
      className={cn(
        "aui-tool-group-content relative overflow-hidden text-xs outline-none",
        "group/collapsible-content ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none",
        "data-closed:animate-collapsible-up",
        "data-open:animate-collapsible-down",
        "data-closed:fill-mode-forwards",
        "data-closed:pointer-events-none",
        "[--tw-duration:var(--animation-duration)]",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "flex flex-col",
          "group-data-[variant=ghost]/tool-group-root:ps-3 group-data-[variant=ghost]/tool-group-root:[&_.aui-scaffold]:mt-0",
          "group-data-[variant=outline]/tool-group-root:mt-3 group-data-[variant=outline]/tool-group-root:border-t group-data-[variant=outline]/tool-group-root:px-4 group-data-[variant=outline]/tool-group-root:pt-3",
          "group-data-[variant=muted]/tool-group-root:mt-3 group-data-[variant=muted]/tool-group-root:border-t group-data-[variant=muted]/tool-group-root:px-4 group-data-[variant=muted]/tool-group-root:pt-3",
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

type ToolGroupComponent = FC<PropsWithChildren<{ startIndex: number; endIndex: number }>> & {
  Root: typeof ToolGroupRoot;
  Trigger: typeof ToolGroupTrigger;
  Content: typeof ToolGroupContent;
};

const ToolGroupImpl: FC<PropsWithChildren<{ startIndex: number; endIndex: number }>> = ({
  children,
  startIndex,
  endIndex,
}) => {
  const toolCount = endIndex - startIndex + 1;
  if (toolCount < 2) return children;

  return (
    <ToolGroupRoot>
      <ToolGroupTrigger count={toolCount} />
      <ToolGroupContent>{children}</ToolGroupContent>
    </ToolGroupRoot>
  );
};

/**
 * @deprecated This wrapper targets the legacy `components.ToolGroup` prop
 * on `<MessagePrimitive.Parts>`. Use `<MessagePrimitive.GroupedParts>` with
 * a `groupBy` returning `"group-tool"` and compose `ToolGroupRoot` /
 * `ToolGroupTrigger` / `ToolGroupContent` directly. See `thread.tsx`.
 */
const ToolGroup = memo(ToolGroupImpl) as unknown as ToolGroupComponent;

ToolGroup.displayName = "ToolGroup";
ToolGroup.Root = ToolGroupRoot;
ToolGroup.Trigger = ToolGroupTrigger;
ToolGroup.Content = ToolGroupContent;

export { ToolGroup, ToolGroupRoot, ToolGroupTrigger, ToolGroupContent, toolGroupVariants };
