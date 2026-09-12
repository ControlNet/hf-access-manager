import "server-only";
import { randomBytes } from "node:crypto";

/** Initialize once in the Node process, before the Edge middleware sandbox is created. */
export function initializeAuthSecret(): string {
  const configured = process.env.AUTH_SECRET;
  if (configured) {
    if (configured.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters long.");
    return configured;
  }

  // Separate serverless functions and Edge instances cannot share process-local randomness.
  if (process.env.VERCEL === "1") {
    throw new Error("AUTH_SECRET must be configured on Vercel so all runtimes share the same signing key.");
  }

  const secret = randomBytes(32).toString("hex");
  process.env.AUTH_SECRET = secret;
  console.warn("AUTH_SECRET is not configured; using an in-memory random key. Restarting logs out reviewers. Configure AUTH_SECRET for multiple instances.");
  return secret;
}
