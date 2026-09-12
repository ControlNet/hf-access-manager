export const ABSOLUTE_MAX_PAGES = 100;

/**
 * Clamps user-supplied maxPages parameter to a safe bounded integer [1, ABSOLUTE_MAX_PAGES].
 * Safely handles negative values, zero, non-numeric strings, and arbitrarily large inputs.
 */
export function clampMaxPages(maxPagesParam: string | null | undefined): number | undefined {
  if (maxPagesParam === null || maxPagesParam === undefined || maxPagesParam.trim() === "") {
    return undefined;
  }
  const parsed = parseInt(maxPagesParam, 10);
  if (isNaN(parsed)) {
    return undefined;
  }
  if (parsed < 1) {
    return 1;
  }
  if (parsed > ABSOLUTE_MAX_PAGES) {
    return ABSOLUTE_MAX_PAGES;
  }
  return parsed;
}
