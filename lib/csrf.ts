import { NextRequest } from "next/server";

/**
 * Validates that a state-changing mutation request originates from the same site.
 * Checks the Origin or Referer header against the request's Host header.
 */
export function validateMutationOrigin(request: NextRequest): boolean {
  // In non-browser environments or tests, Origin/Referer might not be sent.
  // In production browsers, state-changing POST requests always include Origin or Referer.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const matches = (value: string) => {
    const actual = new URL(value);
    if (!["http:", "https:"].includes(actual.protocol) || actual.username || actual.password) return false;
    if (process.env.APP_ORIGIN) {
      const expected = new URL(process.env.APP_ORIGIN);
      if (expected.pathname !== "/" || expected.search || expected.hash || expected.username || expected.password) return false;
      return actual.origin === expected.origin;
    }
    const protocol = process.env.NODE_ENV === "production" ? "https:" : request.nextUrl.protocol;
    return actual.origin === `${protocol}//${host}`;
  };

  if (!origin || !host) {
    // If no origin header is present, allow only in development/test or check referer
    const referer = request.headers.get("referer");
    if (referer && host) {
      try {
        return matches(referer);
      } catch {
        return false;
      }
    }
    // If neither is present, allow in non-production (e.g. CLI curl or tests)
    return process.env.NODE_ENV !== "production";
  }

  try {
    return matches(origin);
  } catch {
    return false;
  }
}
