import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";

describe("lib/env", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      HF_TOKEN: "hf_test_token_12345",
      HF_REPOSITORIES: "model:meta-llama/Llama-2-7b,dataset:VL4AI/SpatialBench",
      APP_PASSWORD: "test-app-password",
      AUTH_SECRET: "1234567890123456789012345678901234567890",
      SESSION_MAX_AGE: "86400",
    };
    resetEnvCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEnvCache();
  });

  it("successfully parses valid environment variables", () => {
    const config = getEnv();
    expect(config.hfToken).toBe("hf_test_token_12345");
    expect(config.appPassword).toBe("test-app-password");
    expect(config.authSecret).toBe("1234567890123456789012345678901234567890");
    expect(config.sessionMaxAge).toBe(86400);
    expect(config.hfRepositories).toEqual([
      { type: "model", repoId: "meta-llama/Llama-2-7b" },
      { type: "dataset", repoId: "VL4AI/SpatialBench" },
    ]);
  });

  it("defaults SESSION_MAX_AGE to 604800 (7 days) if omitted", () => {
    delete process.env.SESSION_MAX_AGE;
    resetEnvCache();

    const config = getEnv();
    expect(config.sessionMaxAge).toBe(604800);
  });

  it("throws error if AUTH_SECRET is shorter than 32 characters", () => {
    process.env.AUTH_SECRET = "short-secret";
    resetEnvCache();

    expect(() => getEnv()).toThrow("AUTH_SECRET must be at least 32 characters long");
  });

  it("throws error if HF_TOKEN is missing", () => {
    delete process.env.HF_TOKEN;
    resetEnvCache();

    expect(() => getEnv()).toThrow("HF_TOKEN must be provided");
  });

  it("throws error if APP_PASSWORD is missing", () => {
    delete process.env.APP_PASSWORD;
    resetEnvCache();

    expect(() => getEnv()).toThrow("APP_PASSWORD must be provided");
  });
});
