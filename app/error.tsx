"use client";

import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <StatusScreen
      title="That didn't go through"
      description="Something on our end gave out. Your resume is still here — try again and it should pick up where it left off."
      action={
        <Button variant="secondary" size="sm" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
