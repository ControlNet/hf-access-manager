import "server-only";
import { z } from "zod";
import { ManagedRepository } from "./types";
import { parseRepositories } from "./repositories";
import { initializeAuthSecret } from "./runtime-auth-secret";

const envSchema = z.object({
  HF_TOKEN: z
    .string({ required_error: "HF_TOKEN must be provided" })
    .min(1, "HF_TOKEN must be provided"),
  HF_REPOSITORIES: z
    .string({ required_error: "HF_REPOSITORIES must be provided" })
    .min(1, "HF_REPOSITORIES must be provided"),
  APP_PASSWORD: z
    .string({ required_error: "APP_PASSWORD must be provided" })
    .min(16, "APP_PASSWORD must be at least 16 characters long")
    .max(1024, "APP_PASSWORD must not exceed 1024 characters"),
  AUTH_SECRET: z
    .string({ required_error: "AUTH_SECRET must be provided" })
    .min(32, "AUTH_SECRET must be at least 32 characters long"),
  SESSION_MAX_AGE: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 604800; // 7 days in seconds
      const parsed = Number(val);
      if (!/^\d+$/.test(val) || !Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 31536000) {
        throw new Error("SESSION_MAX_AGE must be an integer between 1 and 31536000 seconds.");
      }
      return parsed;
    }),
});

export interface AppConfig {
  hfToken: string;
  hfRepositories: ManagedRepository[];
  rawRepositoriesString: string;
  appPassword: string;
  authSecret: string;
  sessionMaxAge: number;
}

let cachedConfig: AppConfig | null = null;

export function getEnv(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = envSchema.safeParse({
    HF_TOKEN: process.env.HF_TOKEN,
    HF_REPOSITORIES: process.env.HF_REPOSITORIES,
    APP_PASSWORD: process.env.APP_PASSWORD,
    AUTH_SECRET: initializeAuthSecret(),
    SESSION_MAX_AGE: process.env.SESSION_MAX_AGE,
  });

  if (!result.success) {
    const errorMessages = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Environment configuration error: ${errorMessages}`);
  }

  const { HF_TOKEN, HF_REPOSITORIES, APP_PASSWORD, AUTH_SECRET, SESSION_MAX_AGE } = result.data;

  // Validate repositories format
  const parsedRepositories = parseRepositories(HF_REPOSITORIES);

  cachedConfig = {
    hfToken: HF_TOKEN,
    hfRepositories: parsedRepositories,
    rawRepositoriesString: HF_REPOSITORIES,
    appPassword: APP_PASSWORD,
    authSecret: AUTH_SECRET,
    sessionMaxAge: SESSION_MAX_AGE,
  };

  return cachedConfig;
}

/**
 * Resets cached environment config (useful for testing)
 */
export function resetEnvCache(): void {
  cachedConfig = null;
}
