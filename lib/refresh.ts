/**
 * Evaluates whether the refresh timestamp should be updated.
 * Timestamp updates MUST occur only when:
 * 1. The fetch request succeeded
 * 2. The response parsed successfully
 * 3. The request was not aborted
 */
export function shouldUpdateRefreshTimestamp(params: {
  success: boolean;
  aborted: boolean;
}): boolean {
  return params.success && !params.aborted;
}

/**
 * Resolves the next refresh timestamp.
 * Returns newTimestamp if shouldUpdateRefreshTimestamp is true, otherwise preserves previousTimestamp.
 */
export function resolveRefreshTimestamp(
  previousTimestamp: Date | null,
  params: {
    success: boolean;
    aborted: boolean;
    newTimestamp?: Date;
  }
): Date | null {
  if (shouldUpdateRefreshTimestamp(params)) {
    return params.newTimestamp ?? new Date();
  }
  return previousTimestamp;
}
