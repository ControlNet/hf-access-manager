import { jwtVerify } from "jose/jwt/verify";

export const SESSION_COOKIE_NAME = "hf_access_session";

/**
 * Derives a deterministic cryptographic session signing key from both
 * AUTH_SECRET and APP_PASSWORD.
 * 
 * Incorporating APP_PASSWORD ensures that rotating the shared password
 * immediately and statelessly invalidates all previously issued session tokens.
 */
export async function deriveSessionKey(authSecret: string, appPassword: string): Promise<Uint8Array> {
  if (!authSecret || !appPassword) {
    throw new Error("Both authSecret and appPassword are required to derive session key.");
  }
  const enc = new TextEncoder();
  const data = enc.encode(`${authSecret}\0${appPassword}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hashBuffer);
}

/**
 * Verifies a session JWT using the derived key from authSecret and appPassword.
 * Usable across both standard Node server routes and Edge Middleware.
 */
export async function verifyTokenWithSecrets(
  token: string,
  authSecret: string,
  appPassword: string
): Promise<boolean> {
  if (!token || typeof token !== "string" || !authSecret || !appPassword) {
    return false;
  }

  try {
    const key = await deriveSessionKey(authSecret, appPassword);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      requiredClaims: ["exp", "iat"],
    });

    return payload.authenticated === true;
  } catch {
    return false;
  }
}
