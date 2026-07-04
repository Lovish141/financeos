import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { SESSION_MAX_AGE_SEC } from "@/auth";

// Explicit database-session management for credential auth. A session is an
// opaque random token stored in the `Session` table; the same token is set as
// the Auth.js session cookie so `auth()` resolves it via the Prisma adapter.

const isProd = process.env.NODE_ENV === "production";

// Matches the cookie name Auth.js reads for database sessions.
function sessionCookieName(): string {
  return isProd ? "__Secure-authjs.session-token" : "authjs.session-token";
}

/** Create a DB session for the user and set the session cookie. */
export async function createUserSession(userId: string): Promise<void> {
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000);

  await prisma.session.create({ data: { sessionToken, userId, expires } });

  const jar = await cookies();
  jar.set(sessionCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProd,
    expires,
  });
}

/** Delete the current DB session and clear the cookie (instant revocation). */
export async function destroyUserSession(): Promise<void> {
  const jar = await cookies();
  const name = sessionCookieName();
  const token = jar.get(name)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { sessionToken: token } });
  }
  // Clear by overwriting with the same attributes used when setting it.
  // `__Secure-` prefixed cookies are rejected by browsers unless the
  // clearing Set-Cookie also carries `Secure` (and a matching path), so a
  // plain `jar.delete(name)` leaves the cookie in place.
  jar.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProd,
    maxAge: 0,
  });
}
