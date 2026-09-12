import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeAuthSecret } from "@/lib/runtime-auth-secret";
import { getEnv, resetEnvCache } from "@/lib/env";
import { createSessionToken, verifySessionToken } from "@/lib/auth";
import { register } from "@/instrumentation";

// Only synthetic credentials are used; generated secrets must never be logged.
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", undefined);
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PHASE", undefined);
  vi.stubEnv("HF_TOKEN", "synthetic-only");
  vi.stubEnv("HF_REPOSITORIES", "model:review/synthetic");
  vi.stubEnv("APP_PASSWORD", "synthetic-reviewer-password");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resetEnvCache();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); resetEnvCache(); });

describe("optional runtime AUTH_SECRET", () => {
  it.each([undefined, ""])("generates one 256-bit key when the setting is %s", value => {
    vi.stubEnv("AUTH_SECRET", value);
    const secret = initializeAuthSecret();
    expect(/^[a-f0-9]{64}$/.test(secret)).toBe(true);
    expect(initializeAuthSecret() === secret).toBe(true);
    expect(process.env.AUTH_SECRET === secret).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls).includes(secret)).toBe(false);
  });
  it("preserves an explicit secret without a fallback warning", () => {
    const configured = "synthetic-signing-material".repeat(2);
    vi.stubEnv("AUTH_SECRET", configured);
    expect(initializeAuthSecret() === configured).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });
  it("rejects a configured short secret instead of silently replacing it", () => {
    vi.stubEnv("AUTH_SECRET", "short");
    expect(() => initializeAuthSecret()).toThrow(/at least 32/);
    expect(process.env.AUTH_SECRET === "short").toBe(true);
  });
  it("signs and verifies with the generated key across configuration cache resets", async () => {
    const first = getEnv().authSecret;
    const token = await createSessionToken();
    resetEnvCache();
    expect(getEnv().authSecret === first).toBe(true);
    expect(await verifySessionToken(token)).toBe(true);
  });
  it("invalidates sessions after a fresh process key or password rotation", async () => {
    const token = await createSessionToken();
    const first = getEnv().authSecret;
    vi.stubEnv("AUTH_SECRET", undefined);
    resetEnvCache();
    expect(getEnv().authSecret !== first).toBe(true);
    expect(await verifySessionToken(token)).toBe(false);
    const fresh = await createSessionToken();
    vi.stubEnv("APP_PASSWORD", "synthetic-rotated-password");
    resetEnvCache();
    expect(await verifySessionToken(fresh)).toBe(false);
  });
  it("requires an explicit shared secret on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(() => initializeAuthSecret()).toThrow(/AUTH_SECRET.*Vercel/);
    expect(process.env.AUTH_SECRET).toBeUndefined();
    vi.stubEnv("AUTH_SECRET", "synthetic-signing-material".repeat(2));
    expect(() => initializeAuthSecret()).not.toThrow();
  });
  it("initializes the key during Node startup", async () => {
    await register();
    expect(Boolean(process.env.AUTH_SECRET)).toBe(true);
    expect(getEnv().authSecret === process.env.AUTH_SECRET).toBe(true);
  });
  it.each([
    ["edge", undefined], ["nodejs", "phase-production-build"],
  ])("does not generate a key in %s / %s", async (runtime, phase) => {
    vi.stubEnv("NEXT_RUNTIME", runtime);
    vi.stubEnv("NEXT_PHASE", phase);
    await register();
    expect(process.env.AUTH_SECRET).toBeUndefined();
  });
});
