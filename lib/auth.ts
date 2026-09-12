import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "crypto";
import { getEnv } from "./env";

import { deriveSessionKey, verifyTokenWithSecrets, SESSION_COOKIE_NAME } from "./session-key";

export { SESSION_COOKIE_NAME } from "./session-key";

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
 * Signs a new session JWT using key derived from authSecret and appPassword
 */
export async function createSessionToken(options?: {
  authSecret?: string;
  appPassword?: string;
}): Promise<string> {
  const env = getEnv();
  const authSecret = options?.authSecret ?? env.authSecret;
  const appPassword = options?.appPassword ?? env.appPassword;
  const sessionMaxAge = env.sessionMaxAge;

  const key = await deriveSessionKey(authSecret, appPassword);

  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionMaxAge}s`)
    .sign(key);

  return token;
}

/**
 * Verifies a session JWT using key derived from authSecret and appPassword
 */
export async function verifySessionToken(
  token: string,
  options?: { authSecret?: string; appPassword?: string }
): Promise<boolean> {
  const env = getEnv();
  const authSecret = options?.authSecret ?? env.authSecret;
  const appPassword = options?.appPassword ?? env.appPassword;

  return verifyTokenWithSecrets(token, authSecret, appPassword);
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
