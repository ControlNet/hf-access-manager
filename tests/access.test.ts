import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  aggregateRequests,
  executeBulkApprove,
  executeBulkReject,
  getBulkItemKey,
} from "@/lib/access";
import * as huggingface from "@/lib/huggingface";
import { BulkActionItem, ManagedRepository } from "@/lib/types";

describe("lib/access", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getBulkItemKey", () => {
    it("returns explicit item.id when provided", () => {
      const item: BulkActionItem = {
        id: "explicit-key-123",
        repo: { type: "model", repoId: "org/llama" },
        username: "alice",
      };
      expect(getBulkItemKey(item)).toBe("explicit-key-123");
    });

    it("constructs composite key from repo type, repoId, and username", () => {
      const item: BulkActionItem = {
        repo: { type: "dataset", repoId: "org/my-dataset" },
        username: "bob",
      };
      expect(getBulkItemKey(item)).toBe("dataset:org/my-dataset:bob");
    });
  });

  describe("executeBulkApprove with composite identity and partial failure", () => {
    it("isolates errors by composite key when same username exists across multiple repositories", async () => {
      const modelRepo: ManagedRepository = {
        type: "model",
        repoId: "org/model-repo",
      };
      const datasetRepo: ManagedRepository = {
        type: "dataset",
        repoId: "org/dataset-repo",
      };

      const item1: BulkActionItem = {
        id: "model:org/model-repo:alice",
        repo: modelRepo,
        username: "alice",
      };
      const item2: BulkActionItem = {
        id: "dataset:org/dataset-repo:alice",
        repo: datasetRepo,
        username: "alice",
      };

      const approveSpy = vi
        .spyOn(huggingface, "approveRequest")
        .mockImplementation(async (repo) => {
          if (repo.repoId === "org/dataset-repo") {
            throw new Error("Repository dataset-repo access error 404");
          }
          return;
        });

      const result = await executeBulkApprove([item1, item2]);

      expect(approveSpy).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);

      // The error must be attributed to the exact composite ID of the failed item
      expect(result.errors[0].id).toBe("dataset:org/dataset-repo:alice");
      expect(result.errors[0].item.repo.repoId).toBe("org/dataset-repo");
      expect(result.errors[0].error).toContain("Repository dataset-repo access error 404");

      // The successful item must not be reported as failed
      const failedIds = new Set(result.errors.map((e) => e.id));
      expect(failedIds.has("model:org/model-repo:alice")).toBe(false);
    });
  });

  describe("executeBulkReject with composite identity and partial failure", () => {
    it("correctly identifies failed items without colliding on username", async () => {
      const modelRepo: ManagedRepository = {
        type: "model",
        repoId: "org/model-1",
      };
      const datasetRepo: ManagedRepository = {
        type: "dataset",
        repoId: "org/dataset-2",
      };

      const items: BulkActionItem[] = [
        { repo: modelRepo, username: "charlie" },
        { repo: datasetRepo, username: "charlie" },
      ];

      vi.spyOn(huggingface, "rejectRequest").mockImplementation(async (repo) => {
        if (repo.repoId === "org/model-1") {
          throw new Error("Permission denied for model-1");
        }
      });

      const result = await executeBulkReject(items);

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors[0].id).toBe("model:org/model-1:charlie");
      expect(result.errors[0].error).toBe("Permission denied for model-1");
    });
  });

  describe("aggregateRequests", () => {
    it("aggregates across repositories and tracks truncation flags", async () => {
      const repo1: ManagedRepository = { type: "model", repoId: "org/model-a" };
      const repo2: ManagedRepository = { type: "dataset", repoId: "org/dataset-b" };

      vi.spyOn(huggingface, "getPendingRequests").mockImplementation(async (repo) => {
        if (repo.repoId === "org/model-a") {
          return {
            requests: [
              {
                id: "model:org/model-a:user1",
                username: "user1",
                requestedAt: "2026-09-12T10:00:00Z",
                status: "pending",
                repository: repo,
                fields: {},
              },
            ],
            hasMore: false,
            truncated: false,
            totalLoaded: 1,
            nextUrl: null,
          };
        } else {
          return {
            requests: [
              {
                id: "dataset:org/dataset-b:user2",
                username: "user2",
                requestedAt: "2026-09-12T11:00:00Z",
                status: "pending",
                repository: repo,
                fields: {},
              },
            ],
            hasMore: true,
            truncated: true,
            totalLoaded: 1,
            nextUrl: "https://huggingface.co/api/datasets/org/dataset-b/user-access-request/pending?page=2",
          };
        }
      });

      const result = await aggregateRequests([repo1, repo2], "pending");

      expect(result.totalRepos).toBe(2);
      expect(result.successfulRepos).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.hasMore).toBe(true);
      expect(result.truncated).toBe(true);
      expect(result.requests).toHaveLength(2);
      // Newest requestedAt first: user2 (11:00) then user1 (10:00)
      expect(result.requests[0].username).toBe("user2");
      expect(result.requests[1].username).toBe("user1");
      expect(result.repositoryPagination).toEqual({
        "model:org/model-a": { hasMore: false, truncated: false },
        "dataset:org/dataset-b": { hasMore: true, truncated: true },
      });
    });

    it("isolates repository errors using Promise.allSettled", async () => {
      const healthyRepo: ManagedRepository = { type: "model", repoId: "org/healthy" };
      const failingRepo: ManagedRepository = { type: "dataset", repoId: "org/failing" };

      vi.spyOn(huggingface, "getPendingRequests").mockImplementation(async (repo) => {
        if (repo.repoId === "org/healthy") {
          return {
            requests: [
              {
                id: "model:org/healthy:user1",
                username: "user1",
                status: "pending",
                repository: repo,
                fields: {},
              },
            ],
            hasMore: false,
            truncated: false,
            totalLoaded: 1,
            nextUrl: null,
          };
        }
        throw new Error("500 Internal Server Error from HF");
      });

      const result = await aggregateRequests([healthyRepo, failingRepo], "pending");

      expect(result.totalRepos).toBe(2);
      expect(result.successfulRepos).toBe(1);
      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].username).toBe("user1");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].repo.repoId).toBe("org/failing");
      expect(result.errors[0].error).toContain("500 Internal Server Error");
    });
  });
});
