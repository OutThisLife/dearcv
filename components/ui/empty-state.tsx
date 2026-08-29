import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  action,
  className,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  className?: string;
  description?: ReactNode;
  icon?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <div className={cn("grid min-h-48 place-items-center px-6 text-center", className)}>
      <div className="flex max-w-xs flex-col items-center gap-2">
        {icon ? <div className="text-muted-foreground/50">{icon}</div> : null}
        {title ? <div className="text-sm font-medium">{title}</div> : null}
        {description ? (
          <div className="text-muted-foreground text-xs leading-relaxed">{description}</div>
        ) : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </div>
  );
}
