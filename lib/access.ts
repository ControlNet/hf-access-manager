import "server-only";
import {
  AccessRequest,
  BulkActionItem,
  BulkActionResult,
  ManagedRepository,
  RepositoryStatus,
  RequestStatus,
} from "./types";
import {
  approveRequest,
  checkRepositoryStatus,
  getAcceptedRequests,
  getPendingRequests,
  getRejectedRequests,
  isGatingSupported,
  rejectRequest,
  ListAccessRequestsOptions,
} from "./huggingface";
import { MAX_RESPONSE_BYTES, MAX_UPSTREAM_BYTES, operationSignal, REPOSITORY_CONCURRENCY, RequestOptions } from "./request-budget";

export interface AggregateRequestsResult {
  requests: AccessRequest[];
  errors: Array<{
    repo: ManagedRepository;
    error: string;
    code?: string;
  }>;
  totalRepos: number;
  successfulRepos: number;
  hasMore: boolean;
  truncated: boolean;
  repositoryPagination?: Record<string, { hasMore: boolean; truncated: boolean }>;
}

/**
 * Concurrency limiter to run async tasks in bounded batches
 */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Concurrency must be a positive integer");
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Fetches requests for a single repository for a given status
 */
async function fetchRepoRequests(
  repo: ManagedRepository,
  status: RequestStatus,
  options?: ListAccessRequestsOptions
) {
  if (!isGatingSupported(repo.type)) {
    return { requests: [], hasMore: false, truncated: false, totalLoaded: 0 };
  }

  switch (status) {
    case "pending":
      return await getPendingRequests(repo, options);
    case "accepted":
      return await getAcceptedRequests(repo, options);
    case "rejected":
      return await getRejectedRequests(repo, options);
    default:
      return { requests: [], hasMore: false, truncated: false, totalLoaded: 0 };
  }
}

/**
 * Aggregates access requests across all configured repositories with failure isolation.
 * Settles repositories independently with bounded concurrency and one shared deadline.
 * Explicitly records whether any repository had its results truncated by pagination boundaries.
 */
export async function aggregateRequests(
  repositories: ManagedRepository[],
  status: RequestStatus,
  options?: ListAccessRequestsOptions
): Promise<AggregateRequestsResult> {
  const errors: AggregateRequestsResult["errors"] = [];
  const allRequests: AccessRequest[] = [];
  let overallHasMore = false;
  let overallTruncated = false;

  const signal = operationSignal(options?.signal);
  const budget = { remainingBytes: MAX_UPSTREAM_BYTES };
  const results = await mapConcurrent(repositories, REPOSITORY_CONCURRENCY, async (repo) => {
    try {
      signal.throwIfAborted();
      if (!isGatingSupported(repo.type)) {
        return { status: "fulfilled" as const, value: { repo, requests: [], hasMore: false, truncated: false } };
      }
      const paginated = await fetchRepoRequests(repo, status, { ...options, signal, budget });
      return { status: "fulfilled" as const, value: {
        repo,
        requests: paginated.requests,
        hasMore: paginated.hasMore,
        truncated: paginated.truncated,
      } };
    } catch (reason) {
      return { status: "rejected" as const, reason };
    }
  });
  options?.signal?.throwIfAborted();

  let successfulRepos = 0;
  const repositoryPagination: Record<string, { hasMore: boolean; truncated: boolean }> = {};
  let responseBytes = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const repo = repositories[i];

    if (result.status === "fulfilled") {
      const bytes = Buffer.byteLength(JSON.stringify(result.value.requests));
      if (responseBytes + bytes > MAX_RESPONSE_BYTES) {
        errors.push({ repo, error: "Result exceeds the safe display size. Reduce the history window or configured repositories.", code: "HF_RESPONSE_LIMIT" });
        continue;
      }
      responseBytes += bytes;
      successfulRepos++;
      allRequests.push(...result.value.requests);
      if (result.value.hasMore) overallHasMore = true;
      if (result.value.truncated) overallTruncated = true;
      const key = `${result.value.repo.type}:${result.value.repo.repoId}`;
      repositoryPagination[key] = {
        hasMore: Boolean(result.value.hasMore),
        truncated: Boolean(result.value.truncated),
      };
    } else {
      const reason = result.reason;
      const errorMsg = reason instanceof Error ? reason.message : String(reason);
      const code = (reason as { code?: string })?.code;
      errors.push({
        repo,
        error: errorMsg,
        code,
      });
    }
  }

  // Sort requests descending by requestedAt date (newest first)
  allRequests.sort((a, b) => {
    if (!a.requestedAt && !b.requestedAt) return 0;
    if (!a.requestedAt) return 1;
    if (!b.requestedAt) return -1;
    return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
  });

  return {
    requests: allRequests,
    errors,
    totalRepos: repositories.length,
    successfulRepos,
    hasMore: overallHasMore,
    truncated: overallTruncated,
    repositoryPagination,
  };
}

/**
 * Aggregates diagnostic status across all configured repositories with failure isolation.
 */
export async function aggregateRepositoriesStatus(
  repositories: ManagedRepository[],
  options?: RequestOptions
): Promise<RepositoryStatus[]> {
  const signal = operationSignal(options?.signal);
  const budget = { remainingBytes: MAX_UPSTREAM_BYTES };
  return mapConcurrent(repositories, REPOSITORY_CONCURRENCY, async repo => {
    try {
      signal.throwIfAborted();
      return await checkRepositoryStatus(repo, { ...options, signal, budget });
    } catch {
      return { repository: repo, status: "error", message: "Repository check cancelled or timed out." };
    }
  });
}

/**
 * Generates canonical composite key for a bulk action item
 */
export function getBulkItemKey(item: BulkActionItem): string {
  return item.id || `${item.repo.type}:${item.repo.repoId}:${item.username}`;
}

/**
 * Executes bulk approve action across multiple requests with concurrency limit (e.g. 5).
 * Preserves exact composite identity (repo + username) for partial failure handling.
 */
export async function executeBulkApprove(
  items: BulkActionItem[],
  concurrency = 5,
  options?: RequestOptions
): Promise<BulkActionResult> {
  const errors: BulkActionResult["errors"] = [];
  let succeeded = 0;
  const signal = operationSignal(options?.signal);
  const budget = options?.budget ?? { remainingBytes: MAX_UPSTREAM_BYTES };

  await mapConcurrent(items, concurrency, async (item) => {
    const itemKey = getBulkItemKey(item);
    try {
      signal.throwIfAborted();
      await approveRequest(item.repo, item.username, { ...options, signal, budget });
      succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({
        id: itemKey,
        item,
        error: errorMsg,
      });
    }
  });

  return {
    total: items.length,
    succeeded,
    failed: errors.length,
    errors,
  };
}

/**
 * Executes bulk reject action across multiple requests with concurrency limit (e.g. 5).
 * Preserves exact composite identity (repo + username) for partial failure handling.
 */
export async function executeBulkReject(
  items: BulkActionItem[],
  concurrency = 5,
  options?: RequestOptions
): Promise<BulkActionResult> {
  const errors: BulkActionResult["errors"] = [];
  let succeeded = 0;
  const signal = operationSignal(options?.signal);
  const budget = options?.budget ?? { remainingBytes: MAX_UPSTREAM_BYTES };

  await mapConcurrent(items, concurrency, async (item) => {
    const itemKey = getBulkItemKey(item);
    try {
      signal.throwIfAborted();
      await rejectRequest(item.repo, item.username, { ...options, signal, budget });
      succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({
        id: itemKey,
        item,
        error: errorMsg,
      });
    }
  });

  return {
    total: items.length,
    succeeded,
    failed: errors.length,
    errors,
  };
}
