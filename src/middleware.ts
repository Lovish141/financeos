import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Lightweight gate: presence of the Auth.js session cookie. Full authorization
// (role, tenant) is enforced server-side in requireSession(). This just keeps
// unauthenticated users out of the app shell without importing the full auth
// runtime into the edge middleware.
const PUBLIC_PATHS = ["/login", "/register"];

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const hasSession = SESSION_COOKIES.some((c) => req.cookies.has(c));

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, the auth API, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
