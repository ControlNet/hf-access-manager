import { describe, it, expect } from "vitest";
import {
  normalizeHfAccessRequest,
  isGatingSupported,
} from "@/lib/huggingface";
import { ManagedRepository } from "@/lib/types";

describe("lib/huggingface", () => {
  const modelRepo: ManagedRepository = {
    type: "model",
    repoId: "meta-llama/Llama-2-7b",
  };

  const datasetRepo: ManagedRepository = {
    type: "dataset",
    repoId: "VL4AI/SpatialBench",
  };

  const spaceRepo: ManagedRepository = {
    type: "space",
    repoId: "owner/example-space",
  };

  describe("isGatingSupported", () => {
    it("returns true for model and dataset", () => {
      expect(isGatingSupported("model")).toBe(true);
      expect(isGatingSupported("dataset")).toBe(true);
    });

    it("returns false for space", () => {
      expect(isGatingSupported("space")).toBe(false);
    });
  });

  describe("normalizeHfAccessRequest", () => {
    it("normalizes typical HF request with nested user object and custom gated fields", () => {
      const rawItem = {
        user: {
          user: "alice-ai",
          fullname: "Alice Zhang",
          email: "alice@unimelb.edu.au",
        },
        status: "pending",
        timestamp: "2026-09-12T10:42:00.000Z",
        fields: {
          affiliation: "University of Melbourne",
          position: "PhD Student",
          supervisor: "Prof. Example",
          intendedUsage: "Academic research on vision-language models",
          country: "Australia",
        },
      };

      const normalized = normalizeHfAccessRequest(rawItem, "pending", datasetRepo);

      expect(normalized.id).toBe("dataset:VL4AI/SpatialBench:alice-ai");
      expect(normalized.username).toBe("alice-ai");
      expect(normalized.fullName).toBe("Alice Zhang");
      expect(normalized.email).toBe("alice@unimelb.edu.au");
      expect(normalized.requestedAt).toBe("2026-09-12T10:42:00.000Z");
      expect(normalized.status).toBe("pending");
      expect(normalized.repository).toEqual(datasetRepo);
      expect(normalized.fields).toEqual({
        affiliation: "University of Melbourne",
        position: "PhD Student",
        supervisor: "Prof. Example",
        intendedUsage: "Academic research on vision-language models",
        country: "Australia",
      });
      expect(normalized).not.toHaveProperty("raw");
    });

    it("handles request with string user and empty fields gracefully", () => {
      const rawItem = {
        user: "bob-smith",
        timestamp: "2026-09-11T12:00:00.000Z",
      };

      const normalized = normalizeHfAccessRequest(rawItem, "accepted", modelRepo);

      expect(normalized.id).toBe("model:meta-llama/Llama-2-7b:bob-smith");
      expect(normalized.username).toBe("bob-smith");
      expect(normalized.fullName).toBeUndefined();
      expect(normalized.email).toBeUndefined();
      expect(normalized.status).toBe("accepted");
      expect(normalized.fields).toEqual({});
    });

    it("handles custom fields that vary arbitrarily across gated repos", () => {
      const rawItem = {
        user: {
          user: "charlie",
          fullname: "Charlie Brown",
        },
        timestamp: "2026-09-10T08:00:00.000Z",
        fields: {
          company: "Acme Corp",
          acceptTerms: true,
          requestedGpuCount: 8,
          details: { nestedKey: "nestedValue" },
        },
      };

      const normalized = normalizeHfAccessRequest(rawItem, "rejected", modelRepo);

      expect(normalized.username).toBe("charlie");
      expect(normalized.fields).toEqual({
        company: "Acme Corp",
        acceptTerms: true,
        requestedGpuCount: 8,
        details: { nestedKey: "nestedValue" },
      });
    });
  });
});
