import { describe, it, expect } from "vitest";
import {
  shouldUpdateRefreshTimestamp,
  resolveRefreshTimestamp,
} from "@/lib/refresh";

describe("refresh timestamp semantics", () => {
  const previousTime = new Date("2026-09-12T10:00:00Z");
  const newTime = new Date("2026-09-12T10:05:00Z");

  describe("shouldUpdateRefreshTimestamp", () => {
    it("returns true only when request succeeded and was not aborted", () => {
      expect(
        shouldUpdateRefreshTimestamp({ success: true, aborted: false })
      ).toBe(true);
    });

    it("returns false when request failed", () => {
      expect(
        shouldUpdateRefreshTimestamp({ success: false, aborted: false })
      ).toBe(false);
    });

    it("returns false when request was aborted (even if successful before abort)", () => {
      expect(
        shouldUpdateRefreshTimestamp({ success: true, aborted: true })
      ).toBe(false);
    });

    it("returns false when request failed and was aborted", () => {
      expect(
        shouldUpdateRefreshTimestamp({ success: false, aborted: true })
      ).toBe(false);
    });
  });

  describe("resolveRefreshTimestamp", () => {
    it("updates timestamp after successful non-aborted fetch", () => {
      const resolved = resolveRefreshTimestamp(previousTime, {
        success: true,
        aborted: false,
        newTimestamp: newTime,
      });
      expect(resolved).toEqual(newTime);
    });

    it("preserves previous timestamp when fetch fails", () => {
      const resolved = resolveRefreshTimestamp(previousTime, {
        success: false,
        aborted: false,
        newTimestamp: newTime,
      });
      expect(resolved).toEqual(previousTime);
    });

    it("preserves previous timestamp when fetch was aborted", () => {
      const resolved = resolveRefreshTimestamp(previousTime, {
        success: true,
        aborted: true,
        newTimestamp: newTime,
      });
      expect(resolved).toEqual(previousTime);
    });

    it("preserves null when initial fetch fails or is aborted", () => {
      const resolved = resolveRefreshTimestamp(null, {
        success: false,
        aborted: false,
        newTimestamp: newTime,
      });
      expect(resolved).toBeNull();
    });
  });
});
