import { describe, it, expect } from "vitest";
import { clampMaxPages, ABSOLUTE_MAX_PAGES } from "@/lib/pagination";

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
