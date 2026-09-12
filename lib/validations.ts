import { z } from "zod";
export const usernameSchema = z.string().trim().min(1, "Username is required")
  .max(100, "Username is too long")
  .regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/, "Invalid Hugging Face username");

export const repoPayloadSchema = z.object({
  type: z.enum(["model", "dataset", "space"]),
  repoId: z
    .string()
    .min(1, "Repository ID is required")
    .max(200, "Repository ID is too long")
    .regex(/^[a-zA-Z0-9-._]+(\/[a-zA-Z0-9-._]+)?$/, "Invalid repository ID format")
    .refine(value => value.split("/").every(part => part !== "." && part !== ".."), "Invalid repository path segment"),
});

export const singleMutationSchema = z.object({
  repo: repoPayloadSchema,
  username: usernameSchema,
});

export const bulkMutationSchema = z.object({
  items: z
    .array(singleMutationSchema)
    .min(1, "At least one item must be provided")
    .max(100, "Cannot process more than 100 items at once"),
}).refine(({ items }) => new Set(items.map(item => `${item.repo.type}:${item.repo.repoId}:${item.username.toLowerCase()}`)).size === items.length,
  "Duplicate users in the same repository are not allowed");

export const grantAccessSchema = singleMutationSchema;
