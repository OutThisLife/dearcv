"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-overlay duration-100 supports-backdrop-filter:[backdrop-filter:var(--overlay-filter)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

type DialogBannerTone = "error" | "warn" | "info";

// Tinted strip tucked under the dialog body. Error and warn keep their semantic
// tokens; info stays neutral so it reads as chrome rather than a problem.
const DIALOG_BANNER_TONES: Record<DialogBannerTone, string> = {
  error: "bg-destructive/12 text-destructive",
  warn: "bg-primary/12 text-primary",
  info: "bg-muted text-muted-foreground",
};

function DialogContent({
  className,
  bodyClassName,
  children,
  showCloseButton = true,
  banner,
  bannerTone = "error",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  bodyClassName?: string;
  /**
   * A dialog-level notice, rendered flush to the bottom edge so it reads as
   * part of the dialog rather than a floating alert. Falsy means no banner.
   */
  banner?: React.ReactNode;
  bannerTone?: DialogBannerTone;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {/* Always rendered, banner or not: making this conditional changes the
            tree shape and remounts the whole dialog the moment an error lands. */}
        <div
          data-slot="dialog-body"
          className={cn(
            "relative z-10 grid gap-4 overflow-hidden rounded-xl bg-popover p-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {banner && (
          <div
            data-slot="dialog-banner"
            role={bannerTone === "error" ? "alert" : "status"}
            className={cn(
              // Ride up under the body by one corner radius so its bottom
              // lobes sit over the tint, then pad that overlap back out. The
              // top sits 0.125rem shy of the bottom because half-leading rides
              // above the cap, which would otherwise read top-heavy.
              "relative z-0 -mt-[var(--radius-xl)] overflow-hidden rounded-b-xl px-4 pt-[calc(var(--radius-xl)+0.5rem)] pb-2.5 text-center text-xs leading-relaxed shadow-[inset_0_0.4375rem_0.4375rem_-0.25rem_rgb(0_0_0/0.28)]",
              DIALOG_BANNER_TONES[bannerTone],
            )}
          >
            {banner}
          </div>
        )}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
