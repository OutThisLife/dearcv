import Link from "next/link";

import { StatusScreen } from "@/components/status-screen";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StatusScreen
      title="There's nothing at this address"
      description="The link's either mistyped or pointing at something we've since moved."
      action={
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          Back to your resume
        </Link>
      }
    />
  );
}
