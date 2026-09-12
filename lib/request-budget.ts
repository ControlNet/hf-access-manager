export const AGGREGATE_TIMEOUT_MS = 25_000;
export const MAX_RESPONSE_BYTES = 2_000_000;
export const MAX_UPSTREAM_BYTES = 8_000_000;
export const MAX_PAGE_BYTES = 1_000_000;
export const REPOSITORY_CONCURRENCY = 3;

export interface RequestBudget {
  remainingBytes: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  budget?: RequestBudget;
  timeoutMs?: number;
  tokenOverride?: string;
}

export function operationSignal(signal?: AbortSignal, timeoutMs = AGGREGATE_TIMEOUT_MS): AbortSignal {
  const deadline = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}
