import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyPassword, createSessionToken, verifySessionToken } from "@/lib/auth";
import { resetEnvCache } from "@/lib/env";

describe("lib/auth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      HF_TOKEN: "hf_dummy_token_12345",
      HF_REPOSITORIES: "model:meta-llama/Llama-2-7b,dataset:VL4AI/SpatialBench",
      APP_PASSWORD: "super-secure-shared-password",
      AUTH_SECRET: "this-is-a-long-random-auth-secret-key-at-least-32-chars",
      SESSION_MAX_AGE: "3600",
    };
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  describe("verifyPassword", () => {
    it("returns true for matching password", () => {
      expect(verifyPassword("super-secure-shared-password", "super-secure-shared-password")).toBe(
        true
      );
    });

    it("returns false for non-matching password", () => {
      expect(verifyPassword("wrong-password", "super-secure-shared-password")).toBe(false);
      expect(verifyPassword("", "super-secure-shared-password")).toBe(false);
      expect(verifyPassword("super-secure-shared-password", "")).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(verifyPassword("Super-Secure-Shared-Password", "super-secure-shared-password")).toBe(
        false
      );
    });
  });

  describe("createSessionToken & verifySessionToken", () => {
    it("signs and verifies a valid JWT session token", async () => {
      const token = await createSessionToken();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3);

      const isValid = await verifySessionToken(token);
      expect(isValid).toBe(true);
    });

    it("rejects invalid or tampered token", async () => {
      const token = await createSessionToken();
      const tampered = token.slice(0, -4) + "abcd";

      const isValid = await verifySessionToken(tampered);
      expect(isValid).toBe(false);
    });

    it("rejects token signed with different secret", async () => {
      const token = await createSessionToken();
      const isValid = await verifySessionToken(
        token,
        "different-secret-that-is-at-least-32-characters-long"
      );
      expect(isValid).toBe(false);
    });

    it("rejects empty or garbage token", async () => {
      expect(await verifySessionToken("")).toBe(false);
      expect(await verifySessionToken("not-a-jwt")).toBe(false);
    });
  });
});
