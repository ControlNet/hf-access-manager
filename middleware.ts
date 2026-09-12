import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifyTokenWithSecrets } from "@/lib/session-key";

function applySecurityHeaders(response: NextResponse, isApiRoute = false): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");

  if (isApiRoute) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Exclude static assets and next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/login") ||
    pathname === "/favicon.ico"
  ) {
    return applySecurityHeaders(NextResponse.next(), pathname.startsWith("/api/"));
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authSecret = process.env.AUTH_SECRET || "";
  const appPassword = process.env.APP_PASSWORD || "";

  const isAuthenticated = token
    ? await verifyTokenWithSecrets(token, authSecret, appPassword)
    : false;

  // If user is at /login:
  if (pathname === "/login") {
    if (isAuthenticated) {
      return applySecurityHeaders(NextResponse.redirect(new URL("/", request.url)));
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // All other pages and API routes require authentication
  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      const unauthorizedRes = NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required to access this resource.",
          },
        },
        { status: 401 }
      );
      return applySecurityHeaders(unauthorizedRes, true);
    }

    const loginUrl = new URL("/login", request.url);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return applySecurityHeaders(NextResponse.next(), pathname.startsWith("/api/"));
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
