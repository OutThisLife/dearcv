import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { consumeQuota } from "@/lib/db";
import { sameOriginRequest } from "@/lib/request-security";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Cron authenticates its own bearer token and must work without a browser.
  if (path === "/api/cron/sweep") return NextResponse.next();
  if (!sameOriginRequest(req)) {
    return Response.json({ error: "Use DearCV from its own site." }, { status: 403 });
  }
  if (process.env.NODE_ENV === "production") {
    // An instance-local Map resets on every cold start. Hosted API work needs
    // a shared budget and a secret, or it stays unavailable.
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32 || !process.env.DATABASE_URL) {
      return Response.json(
        { error: "Server security configuration is incomplete." },
        { status: 503 },
      );
    }
    const network = process.env.VERCEL
      ? (req.headers.get("x-vercel-forwarded-for") ?? "unknown")
      : "self-hosted";
    const group =
      path === "/api/chat" || path === "/api/carry"
        ? "model"
        : path === "/api/upload"
          ? "upload"
          : "api";
    const limit = group === "model" ? 30 : group === "upload" ? 10 : 180;
    const key = createHmac("sha256", secret).update(`${group}:${network}`).digest("hex");
    try {
      if (!(await consumeQuota(key, Math.floor(Date.now() / 60_000), limit))) {
        return Response.json(
          { error: "Too many requests. Try again in a minute." },
          {
            status: 429,
            headers: { "Retry-After": "60" },
          },
        );
      }
    } catch {
      return Response.json({ error: "Please try again shortly." }, { status: 503 });
    }
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: "/api/:path*" };
