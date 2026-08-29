import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";

/** Full-bleed centred message for the routes that aren't the editor itself. */
export function StatusScreen({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description?: ReactNode;
  title?: ReactNode;
}) {
  return (
    <main className="bg-sidebar grid h-dvh place-items-center">
      <EmptyState action={action} description={description} title={title} />
    </main>
  );
}
