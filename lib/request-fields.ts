/**
 * Decides which gated-form answers are shown inline on a request row.
 *
 * Hugging Face gated forms are free-form: every repository owner defines their
 * own questions. The dashboard shows every answer on the list itself, so the
 * only decision left is ordering — which four answers earn the always-visible
 * slots, which single answer is the long narrative, and which are folded into
 * the in-place expander.
 */

export interface RequestField {
  key: string;
  label: string;
  /** Display value, or null when the requester left the answer blank. */
  value: string | null;
}

export interface RequestFieldSummary {
  /**
   * Rendered on the row itself, deciding answers first. Only a form long
   * enough to swallow the screen overflows into `extra`.
   */
  inline: RequestField[];
  /** The long free-text answer ("intended use"), rendered under the grid. */
  narrative: RequestField | null;
  /** The overflow of a pathologically long form, expanded in place. */
  extra: RequestField[];
  /** Every answer the form carries, including blank ones. */
  total: number;
  /** How many of those were left blank. */
  emptyCount: number;
}

/**
 * Answers are meant to be read without expanding anything, so this is a guard
 * against one absurd form owning the whole viewport, not a display budget.
 * Real gated forms ask a handful of questions and never reach it.
 */
export const INLINE_LIMIT = 12;

/** How many slots are assigned by question meaning before form order takes over. */
export const PRIORITY_SLOTS = 4;

/** Answers longer than this are clipped before they reach the DOM. */
export const MAX_VALUE_LENGTH = 4000;

/** Ordered: the first pattern that matches an unclaimed field leads the row. */
const PRIMARY_PATTERNS: RegExp[] = [
  /affiliation|organi[sz]ation|institution|university|company|employer|\blab\b|department/i,
  /\brole\b|position|job|occupation|\btitle\b|status/i,
  /country|region|nationality|location|based/i,
  /licen[cs]e|terms|agree|accept|consent|conditions/i,
];

const NARRATIVE_PATTERN =
  /intend|purpose|usage|use[\s_-]?case|reason|motivation|describe|description|research|project|plan/i;

/** A narrative answer is normally long; this is the fallback threshold. */
const NARRATIVE_MIN_LENGTH = 90;

export function formatFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : clip(trimmed);
  }
  if (Array.isArray(value)) {
    const parts = value.map(formatFieldValue).filter((part): part is string => part !== null);
    return parts.length === 0 ? null : clip(parts.join(", "));
  }
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      return !json || json === "{}" ? null : clip(json);
    } catch {
      return null;
    }
  }
  return null;
}

function clip(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value;
}

export function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function summarizeRequestFields(fields: Record<string, unknown> | undefined): RequestFieldSummary {
  const all: RequestField[] = Object.entries(fields || {}).map(([key, raw]) => ({
    key,
    label: formatFieldLabel(key),
    value: formatFieldValue(raw),
  }));

  const claimed = new Set<string>();

  // 1. The narrative: an explicitly named one first, otherwise the longest answer
  //    that is clearly prose rather than a one-word field.
  let narrative =
    all.find((f) => f.value !== null && NARRATIVE_PATTERN.test(f.key)) ?? null;
  if (!narrative) {
    const longest = all
      .filter((f) => f.value !== null && f.value.length >= NARRATIVE_MIN_LENGTH)
      .sort((a, b) => (b.value?.length ?? 0) - (a.value?.length ?? 0))[0];
    narrative = longest ?? null;
  }
  if (narrative) claimed.add(narrative.key);

  // 2. The answers a reviewer decides on lead the row, whatever order the
  //    repository owner happened to put them in.
  const inline: RequestField[] = [];
  for (const pattern of PRIMARY_PATTERNS) {
    if (inline.length >= PRIORITY_SLOTS) break;
    const match = all.find((f) => !claimed.has(f.key) && pattern.test(f.key));
    if (match) {
      inline.push(match);
      claimed.add(match.key);
    }
  }

  // 3. Then every remaining answer in the form's own order — answered ones
  //    first, so a blank answer is never what gets pushed out of sight.
  const remaining = all.filter((f) => !claimed.has(f.key));
  for (const field of [...remaining.filter((f) => f.value !== null), ...remaining.filter((f) => f.value === null)]) {
    if (inline.length >= INLINE_LIMIT) break;
    inline.push(field);
    claimed.add(field.key);
  }

  return {
    inline,
    narrative,
    extra: all.filter((f) => !claimed.has(f.key)),
    total: all.length,
    emptyCount: all.filter((f) => f.value === null).length,
  };
}

/** A request worth a second look: several questions left blank. */
export function isThinRequest(summary: RequestFieldSummary): boolean {
  return summary.total > 0 && summary.emptyCount >= 2;
}
