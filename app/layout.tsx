import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Literata } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  axes: ["opsz"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/**
 * Where share cards and absolute URLs point. Every Vercel deployment uses the
 * real domain — the bare one redirects to www, so www is the canonical name.
 * Locally, the dev server.
 */
const origin = process.env.VERCEL ? "https://www.dearcv.ai" : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: "DearCV",
  description: "Chat with a live PDF resume.",
  openGraph: {
    title: "DearCV",
    description: "Chat with a live PDF resume.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DearCV",
    description: "Chat with a live PDF resume.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${literata.variable} ${ibmPlexMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
