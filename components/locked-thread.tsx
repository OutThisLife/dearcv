import Link from "next/link";

import { StatusScreen } from "@/components/status-screen";
import { buttonVariants } from "@/components/ui/button";

/**
 * Deliberately not a 404: the resume behind this link still exists, and telling
 * someone it's gone would send them looking for a copy they haven't lost.
 */
export function LockedThread() {
  return (
    <StatusScreen
      title="This one isn't yours to open"
      description="It was written under a different key. Connect with that one and it'll be here waiting."
      action={
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Start your own
        </Link>
      }
    />
  );
}
