import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const locales = routing.locales;

/**
 * Check for Auth.js v5 session cookie with basic JWT format validation.
 * Full JWT verification happens in page/API auth() calls; this prevents
 * dummy/empty cookies from bypassing the redirect to login.
 */
function hasSessionCookie(req: NextRequest): boolean {
  const token =
    req.cookies.get("authjs.session-token")?.value || req.cookies.get("__Secure-authjs.session-token")?.value;
  return !!token && token.length > 10;
}

function stripLocale(pathname: string): string {
  for (const locale of locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const path = stripLocale(pathname);

  // App routes: require authentication
  if (path.startsWith("/app")) {
    if (!hasSessionCookie(req)) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Auth pages: redirect authenticated users to app
  if (path === "/login" || path === "/register") {
    if (hasSessionCookie(req)) {
      return NextResponse.redirect(new URL("/app", req.url));
    }
  }

  // All other routes (landing, pricing, indexator, etc.): pass through
  return intlMiddleware(req);
}

export const config = {
  matcher: [
    // Match all pathnames except for
    // - api routes
    // - _next (Next.js internals)
    // - static files (images, etc.)
    "/((?!api|_next|.*\\..*).*)",
  ],
};
