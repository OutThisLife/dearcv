"use client";

import { Inter } from "next/font/google";

import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";
import "./globals.css";

// This replaces the root layout rather than rendering inside it, so it has to
// bring its own document shell, stylesheet and font.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <StatusScreen
          title="The app stopped short"
          description="Reloading usually clears it. If it keeps happening, something's wrong on our side rather than yours."
          action={
            <Button variant="secondary" size="sm" onClick={reset}>
              Reload
            </Button>
          }
        />
      </body>
    </html>
  );
}
