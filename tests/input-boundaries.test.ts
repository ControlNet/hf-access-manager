import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";
import { parseRepositories } from "@/lib/repositories";
import { clampMaxPages } from "@/lib/pagination";
import { repoPayloadSchema, usernameSchema } from "@/lib/validations";

// Process-local synthetic configuration, never a deployable default.
beforeEach(() => {
  vi.stubEnv("HF_TOKEN", "synthetic-only");
  vi.stubEnv("HF_REPOSITORIES", "model:review/synthetic");
  vi.stubEnv("APP_PASSWORD", "synthetic-test-password".repeat(2));
  vi.stubEnv("AUTH_SECRET", "synthetic-test-secret".repeat(2));
  resetEnvCache();
});
afterEach(() => { vi.unstubAllEnvs(); resetEnvCache(); });

describe("configuration and identity boundaries", () => {
  it.each(["10abc", "1e6", "0", "-1", "NaN", "31536001", "999999999999999999999999999"])("rejects invalid session age %s", value => {
    vi.stubEnv("SESSION_MAX_AGE", value);
    expect(() => getEnv()).toThrow(/SESSION_MAX_AGE/);
  });
  it.each(["10abc", "1.2", "1e2", "NaN", "Infinity"])("does not partially parse pagination %s", value => {
    expect(clampMaxPages(value)).toBeUndefined();
  });
  it.each(["../repo", "owner/..", "owner/.", "owner/%2e%2e", "owner/repo/extra", "owner:repo"])("rejects unsafe repository %s in both config and payload", repoId => {
    expect(() => parseRepositories(`model:${repoId}`)).toThrow();
    expect(repoPayloadSchema.safeParse({ type: "model", repoId }).success).toBe(false);
  });
  it("rejects an excessive number of configured repositories", () => {
    expect(() => parseRepositories(Array.from({ length: 21 }, (_, i) => `model:review/synthetic-${i}`).join(","))).toThrow(/20 repositories/);
  });
  it.each([" ", "user/name", "user%2fname", "user:name", "测试", "x".repeat(101)])("rejects invalid usernames", username => {
    expect(usernameSchema.safeParse(username).success).toBe(false);
  });
});
