import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "crypto";
import { getEnv } from "./env";

export const SESSION_COOKIE_NAME = "hf_access_session";

/**
 * Perform timing-safe comparison of password against configured APP_PASSWORD
 */
export function verifyPassword(inputPassword: string, expectedPassword: string): boolean {
  if (!inputPassword || !expectedPassword) {
    return false;
  }

  // Hash both with SHA-256 to ensure identical buffer length and prevent length-timing leaks
  const inputHash = createHash("sha256").update(inputPassword).digest();
  const expectedHash = createHash("sha256").update(expectedPassword).digest();

  return timingSafeEqual(inputHash, expectedHash);
}

/**
 * Returns Uint8Array key suitable for jose HMAC operations
 */
function getJwtSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Signs a new session JWT
 */
export async function createSessionToken(): Promise<string> {
  const { authSecret, sessionMaxAge } = getEnv();
  const key = getJwtSecretKey(authSecret);

  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionMaxAge}s`)
    .sign(key);

  return token;
}

/**
 * Verifies a session JWT and returns true if valid
 */
export async function verifySessionToken(token: string, secretOverride?: string): Promise<boolean> {
  if (!token || typeof token !== "string") {
    return false;
  }

  try {
    const secret = secretOverride ?? getEnv().authSecret;
    const key = getJwtSecretKey(secret);

    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });

    return payload.authenticated === true;
  } catch {
    return false;
  }
}

/**
 * Returns standard cookie configuration for the session cookie
 */
export function getSessionCookieOptions(maxAge?: number) {
  const effectiveMaxAge = maxAge ?? getEnv().sessionMaxAge;
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: effectiveMaxAge,
  };
}
