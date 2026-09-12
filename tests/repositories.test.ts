import { describe, it, expect } from "vitest";
import {
  parseRepositories,
  canonicalRepoKey,
  isRepoAllowed,
  findManagedRepo,
} from "@/lib/repositories";

describe("lib/repositories", () => {
  describe("parseRepositories", () => {
    it("parses valid comma-separated repository list with models, datasets, spaces", () => {
      const input = "model:owner/model-a, dataset:owner/dataset-b , space:owner/space-c";
      const result = parseRepositories(input);

      expect(result).toEqual([
        { type: "model", repoId: "owner/model-a" },
        { type: "dataset", repoId: "owner/dataset-b" },
        { type: "space", repoId: "owner/space-c" },
      ]);
    });

    it("trims excess whitespace correctly", () => {
      const input = "  model:meta-llama/Llama-2-7b  ,   dataset:VL4AI/SpatialBench  ";
      const result = parseRepositories(input);

      expect(result).toEqual([
        { type: "model", repoId: "meta-llama/Llama-2-7b" },
        { type: "dataset", repoId: "VL4AI/SpatialBench" },
      ]);
    });

    it("deduplicates identical repositories", () => {
      const input = "model:owner/model-a, model:owner/model-a, dataset:owner/dataset-a";
      const result = parseRepositories(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: "model", repoId: "owner/model-a" });
      expect(result[1]).toEqual({ type: "dataset", repoId: "owner/dataset-a" });
    });

    it("throws clear error on empty or null input", () => {
      expect(() => parseRepositories("")).toThrow(
        "HF_REPOSITORIES environment variable is empty or not defined."
      );
      expect(() => parseRepositories(undefined)).toThrow(
        "HF_REPOSITORIES environment variable is empty or not defined."
      );
    });

    it("throws clear error on invalid repo type", () => {
      const input = "unknown:owner/repo";
      expect(() => parseRepositories(input)).toThrow(
        'Invalid repository type "unknown" in "unknown:owner/repo". Supported types are: model, dataset, space'
      );
    });

    it("throws clear error on malformed entry without colon", () => {
      const input = "model-without-colon";
      expect(() => parseRepositories(input)).toThrow(
        'Invalid repository format "model-without-colon". Expected syntax: <repo-type>:<owner>/<repo-name>'
      );
    });

    it("throws clear error on invalid repo identifier characters", () => {
      const input = "model:invalid repo name with spaces";
      expect(() => parseRepositories(input)).toThrow(
        'Invalid repository identifier "invalid repo name with spaces"'
      );
    });
  });

  describe("canonicalRepoKey", () => {
    it("returns lowercased type and trimmed repoId", () => {
      expect(canonicalRepoKey({ type: "MODEL", repoId: "Owner/Model-A" })).toBe(
        "model:Owner/Model-A"
      );
      expect(canonicalRepoKey({ type: "dataset", repoId: "VL4AI/SpatialBench" })).toBe(
        "dataset:VL4AI/SpatialBench"
      );
    });
  });

  describe("isRepoAllowed", () => {
    const allowed = [
      { type: "model" as const, repoId: "meta-llama/Llama-2-7b" },
      { type: "dataset" as const, repoId: "VL4AI/SpatialBench" },
    ];

    it("returns true for exact configured repo", () => {
      expect(isRepoAllowed({ type: "model", repoId: "meta-llama/Llama-2-7b" }, allowed)).toBe(true);
      expect(isRepoAllowed({ type: "dataset", repoId: "VL4AI/SpatialBench" }, allowed)).toBe(true);
    });

    it("returns false for unconfigured repo", () => {
      expect(
        isRepoAllowed({ type: "model", repoId: "unauthorized-org/private-repo" }, allowed)
      ).toBe(false);
    });

    it("returns false when type does not match", () => {
      expect(isRepoAllowed({ type: "dataset", repoId: "meta-llama/Llama-2-7b" }, allowed)).toBe(
        false
      );
    });
  });

  describe("findManagedRepo", () => {
    const allowed = [
      { type: "model" as const, repoId: "meta-llama/Llama-2-7b" },
      { type: "dataset" as const, repoId: "VL4AI/SpatialBench" },
    ];

    it("finds matching repository", () => {
      const found = findManagedRepo({ type: "model", repoId: "meta-llama/Llama-2-7b" }, allowed);
      expect(found).toEqual({ type: "model", repoId: "meta-llama/Llama-2-7b" });
    });

    it("returns undefined for non-matching repository", () => {
      const found = findManagedRepo({ type: "model", repoId: "other/repo" }, allowed);
      expect(found).toBeUndefined();
    });
  });
});
