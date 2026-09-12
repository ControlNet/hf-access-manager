import { describe, expect, it } from "vitest";
import {
  MAX_VALUE_LENGTH,
  PRIMARY_LIMIT,
  formatFieldValue,
  isThinRequest,
  summarizeRequestFields,
} from "@/lib/request-fields";

// Synthetic gated-form shapes only; no real applicant data.
describe("formatFieldValue", () => {
  it("normalises the value kinds a gated form can return", () => {
    expect(formatFieldValue("  Monash University  ")).toBe("Monash University");
    expect(formatFieldValue(true)).toBe("Yes");
    expect(formatFieldValue(false)).toBe("No");
    expect(formatFieldValue(3)).toBe("3");
    expect(formatFieldValue(["a", "", "b"])).toBe("a, b");
    expect(formatFieldValue({ nested: 1 })).toBe('{"nested":1}');
  });

  it("treats blank, missing and empty-container answers as unanswered", () => {
    for (const blank of [null, undefined, "", "   ", [], {}, [""], NaN]) {
      expect(formatFieldValue(blank)).toBeNull();
    }
  });

  it("clips an answer that would otherwise flood the row", () => {
    const clipped = formatFieldValue("x".repeat(MAX_VALUE_LENGTH + 500));
    expect(clipped).toHaveLength(MAX_VALUE_LENGTH + 1);
    expect(clipped?.endsWith("…")).toBe(true);
  });
});

describe("summarizeRequestFields", () => {
  it("promotes the answers a reviewer decides on, whatever order the form used", () => {
    const summary = summarizeRequestFields({
      newsletter: "No",
      intended_use: "Evaluating multilingual safety classifiers for a paper.",
      country: "Australia",
      jobTitle: "PhD student",
      affiliation: "Monash University",
      acceptedLicense: true,
    });

    expect(summary.primary.map((f) => f.key)).toEqual([
      "affiliation",
      "jobTitle",
      "country",
      "acceptedLicense",
    ]);
    expect(summary.narrative?.key).toBe("intended_use");
    expect(summary.extra.map((f) => f.key)).toEqual(["newsletter"]);
    expect(summary.total).toBe(6);
  });

  it("never hands more than the inline slots to the row", () => {
    const fields = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`q${i}`, `answer ${i}`]));
    const summary = summarizeRequestFields(fields);
    expect(summary.primary).toHaveLength(PRIMARY_LIMIT);
    expect(summary.primary.length + summary.extra.length + (summary.narrative ? 1 : 0)).toBe(12);
  });

  it("falls back to the longest prose answer when no question is named like a purpose", () => {
    const summary = summarizeRequestFields({
      org: "Example Lab",
      notes: "A short one.",
      story: "y".repeat(120),
    });
    expect(summary.narrative?.key).toBe("story");
  });

  it("keeps a blank answer out of an inline slot when an answered one is waiting", () => {
    const summary = summarizeRequestFields({ a: null, b: null, c: null, d: null, e: "answered" });
    expect(summary.primary[0].key).toBe("e");
    expect(summary.primary.map((f) => f.value)).toContain("answered");
  });

  it("reports labels, blank answers and an empty form without inventing fields", () => {
    const summary = summarizeRequestFields({ intendedUsage: null, company_name: "" });
    expect(summary.primary[0].label).toBe("Company name");
    expect(summary.emptyCount).toBe(2);
    expect(summary.narrative).toBeNull();

    const none = summarizeRequestFields(undefined);
    expect(none).toMatchObject({ primary: [], extra: [], narrative: null, total: 0, emptyCount: 0 });
  });
});

describe("isThinRequest", () => {
  it("flags a form left mostly blank and leaves a complete one alone", () => {
    expect(isThinRequest(summarizeRequestFields({ a: "x", b: null, c: null }))).toBe(true);
    expect(isThinRequest(summarizeRequestFields({ a: "x", b: "y", c: null }))).toBe(false);
    expect(isThinRequest(summarizeRequestFields({}))).toBe(false);
  });
});
