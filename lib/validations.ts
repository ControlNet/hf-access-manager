import { z } from "zod";
import { VALID_REPO_TYPES } from "./repositories";

export const repoPayloadSchema = z.object({
  type: z.enum(["model", "dataset", "space"]),
  repoId: z
    .string()
    .min(1, "Repository ID is required")
    .max(200, "Repository ID is too long")
    .regex(/^[a-zA-Z0-9-._]+(\/[a-zA-Z0-9-._]+)?$/, "Invalid repository ID format"),
});

export const singleMutationSchema = z.object({
  repo: repoPayloadSchema,
  username: z
    .string()
    .min(1, "Username is required")
    .max(100, "Username is too long")
    .trim(),
});

export const bulkMutationSchema = z.object({
  items: z
    .array(singleMutationSchema)
    .min(1, "At least one item must be provided")
    .max(100, "Cannot process more than 100 items at once"),
});

export const grantAccessSchema = z.object({
  repo: repoPayloadSchema,
  username: z
    .string()
    .min(1, "Username is required")
    .max(100, "Username is too long")
    .trim(),
});
