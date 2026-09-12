import { NextRequest } from "next/server";

/**
 * Validates that a state-changing mutation request originates from the same site.
 * Checks the Origin or Referer header against the request's Host header.
 */
export function validateMutationOrigin(request: NextRequest): boolean {
  // In non-browser environments or tests, Origin/Referer might not be sent.
  // In production browsers, state-changing POST requests always include Origin or Referer.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");

  if (!origin || !host) {
    // If no origin header is present, allow only in development/test or check referer
    const referer = request.headers.get("referer");
    if (referer && host) {
      try {
        const refererHost = new URL(referer).host;
        return refererHost === host;
      } catch {
        return false;
      }
    }
    // If neither is present, allow in non-production (e.g. CLI curl or tests)
    return process.env.NODE_ENV !== "production";
  }

  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}
