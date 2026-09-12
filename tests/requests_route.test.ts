import { describe, it, expect } from "vitest";
import {
  clampMaxPages,
  ABSOLUTE_MAX_PAGES,
  PAGE_INCREMENT,
  getNextPageLimit,
  isPaginationAtHardCap,
  canLoadMore,
  shouldDisplayPaginationFooter,
} from "@/lib/pagination";

describe("clampMaxPages (server-side pagination upper bound)", () => {
  it("exports ABSOLUTE_MAX_PAGES as 100", () => {
    expect(ABSOLUTE_MAX_PAGES).toBe(100);
  });

  it("clamps excessive values (e.g. 999999) to ABSOLUTE_MAX_PAGES", () => {
    expect(clampMaxPages("999999")).toBe(100);
    expect(clampMaxPages("101")).toBe(100);
    expect(clampMaxPages("100")).toBe(100);
  });

  it("clamps non-positive numbers (0 and negative) to 1", () => {
    expect(clampMaxPages("0")).toBe(1);
    expect(clampMaxPages("-1")).toBe(1);
    expect(clampMaxPages("-999")).toBe(1);
  });

  it("falls back to undefined for invalid non-numeric strings (safe default)", () => {
    expect(clampMaxPages("abc")).toBeUndefined();
    expect(clampMaxPages("invalid")).toBeUndefined();
    expect(clampMaxPages("")).toBeUndefined();
    expect(clampMaxPages("   ")).toBeUndefined();
  });

  it("returns undefined when parameter is omitted (null or undefined)", () => {
    expect(clampMaxPages(null)).toBeUndefined();
    expect(clampMaxPages(undefined)).toBeUndefined();
  });

  it("preserves valid in-range integers", () => {
    expect(clampMaxPages("1")).toBe(1);
    expect(clampMaxPages("10")).toBe(10);
    expect(clampMaxPages("50")).toBe(50);
    expect(clampMaxPages("99")).toBe(99);
  });
});

describe("pagination hard-cap helpers", () => {
  it("exports PAGE_INCREMENT as 10", () => {
    expect(PAGE_INCREMENT).toBe(10);
  });

  it("increments below hard cap correctly: current=90, increment=10 -> next=100", () => {
    expect(getNextPageLimit(90, 10, 100)).toBe(100);
    expect(getNextPageLimit(10, 10, 100)).toBe(20);
    expect(getNextPageLimit(50, 10, 100)).toBe(60);
  });

  it("clamps at hard cap: current=100, increment=10, max=100 -> next=100", () => {
    expect(getNextPageLimit(100, 10, 100)).toBe(100);
    expect(getNextPageLimit(110, 10, 100)).toBe(100);
  });

  it("detects when hard cap has been reached (isPaginationAtHardCap)", () => {
    expect(isPaginationAtHardCap(10, 100)).toBe(false);
    expect(isPaginationAtHardCap(90, 100)).toBe(false);
    expect(isPaginationAtHardCap(99, 100)).toBe(false);
    expect(isPaginationAtHardCap(100, 100)).toBe(true);
    expect(isPaginationAtHardCap(110, 100)).toBe(true);
  });

  it("determines whether more pages can be loaded (canLoadMore)", () => {
    // Normal cases
    expect(canLoadMore(true, 10, 100)).toBe(true);
    expect(canLoadMore(true, 90, 100)).toBe(true);

    // Hard-cap reached: hasMore is true, but currentMaxPages=100 -> action blocked
    expect(canLoadMore(true, 100, 100)).toBe(false);
    expect(canLoadMore(true, 110, 100)).toBe(false);

    // No more data on HF: hasMore is false
    expect(canLoadMore(false, 10, 100)).toBe(false);
    expect(canLoadMore(false, 100, 100)).toBe(false);
  });

  describe("shouldDisplayPaginationFooter (prevents stale pagination UI while loading)", () => {
    it("hides footer while initial or tab-switch loading (isLoading=true), even if hasMore was true", () => {
      expect(shouldDisplayPaginationFooter(true, true)).toBe(false);
      expect(shouldDisplayPaginationFooter(true, false)).toBe(false);
    });

    it("displays footer when loaded (isLoading=false) and hasMore is true", () => {
      expect(shouldDisplayPaginationFooter(false, true)).toBe(true);
    });

    it("hides footer when loaded (isLoading=false) and hasMore is false", () => {
      expect(shouldDisplayPaginationFooter(false, false)).toBe(false);
    });
  });
});
