import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Light edge gate: anything outside /login and the auth API requires a session
 * cookie. The cookie's presence only decides the redirect; every server
 * component and route handler validates the session against the database
 * independently, so a forged cookie buys nothing.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has("better-auth.session_token");
  if (hasSession) {
    return NextResponse.next();
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
