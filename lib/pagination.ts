export const ABSOLUTE_MAX_PAGES = 100;
export const PAGE_INCREMENT = 10;

/**
 * Clamps user-supplied maxPages parameter to a safe bounded integer [1, ABSOLUTE_MAX_PAGES].
 * Safely handles negative values, zero, non-numeric strings, and arbitrarily large inputs.
 */
export function clampMaxPages(maxPagesParam: string | null | undefined): number | undefined {
  if (maxPagesParam === null || maxPagesParam === undefined || maxPagesParam.trim() === "") {
    return undefined;
  }
  if (!/^-?\d+$/.test(maxPagesParam.trim())) return undefined;
  const parsed = Number(maxPagesParam);
  if (!Number.isFinite(parsed)) {
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

/**
 * Calculates the next page limit bounded by the hard maximum.
 */
export function getNextPageLimit(
  current: number,
  increment: number = PAGE_INCREMENT,
  max: number = ABSOLUTE_MAX_PAGES
): number {
  return Math.min(current + increment, max);
}

/**
 * Checks if the current page limit has reached or exceeded the hard maximum.
 */
export function isPaginationAtHardCap(
  currentMaxPages: number,
  absoluteMax: number = ABSOLUTE_MAX_PAGES
): boolean {
  return currentMaxPages >= absoluteMax;
}

/**
 * Determines whether the "Load more" action is possible.
 * Returns false if hasMore is false or if the hard cap is reached.
 */
export function canLoadMore(
  hasMore: boolean,
  currentMaxPages: number,
  absoluteMax: number = ABSOLUTE_MAX_PAGES
): boolean {
  return hasMore && !isPaginationAtHardCap(currentMaxPages, absoluteMax);
}

/**
 * Determines whether the truncation / Load More footer should be visible in the UI.
 * Stale pagination from a previous tab must never be rendered while the active tab is loading.
 */
export function shouldDisplayPaginationFooter(isLoading: boolean, hasMore: boolean): boolean {
  return !isLoading && hasMore;
}
