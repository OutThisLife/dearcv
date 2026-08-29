import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

const COOKIE = "dearcv.session";
const MAX_AGE = 60 * 60 * 24 * 365;

const secret = process.env.AUTH_SECRET ? new TextEncoder().encode(process.env.AUTH_SECRET) : null;

/**
 * A cookie, not the key. The key is the portable credential — paste it on a
 * second device and that device mints its own cookie — but a page rendered on
 * the server can't reach localStorage, so the answer to "who is asking" has to
 * arrive with the request. Only the owner id travels in it; the key never does.
 */
export async function readViewer() {
  if (!secret) return null;

  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    // Expired, or signed with a secret we no longer use. Either way they are
    // nobody until they connect again.
    return null;
  }
}

export async function startSession(owner: string) {
  if (!secret) return;

  const token = await new SignJWT()
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(owner)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}
