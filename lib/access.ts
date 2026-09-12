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
} from "./huggingface";

export interface AggregateRequestsResult {
  requests: AccessRequest[];
  errors: Array<{
    repo: ManagedRepository;
    error: string;
    code?: string;
  }>;
  totalRepos: number;
  successfulRepos: number;
}

/**
 * Concurrency limiter to run async tasks in bounded batches
 */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
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
 * Fetches requests for a single repository for a given status or all statuses
 */
async function fetchRepoRequests(
  repo: ManagedRepository,
  status: RequestStatus
): Promise<AccessRequest[]> {
  if (!isGatingSupported(repo.type)) {
    return [];
  }

  switch (status) {
    case "pending":
      return await getPendingRequests(repo);
    case "accepted":
      return await getAcceptedRequests(repo);
    case "rejected":
      return await getRejectedRequests(repo);
    default:
      return [];
  }
}

/**
 * Aggregates access requests across all configured repositories with failure isolation.
 * Uses Promise.allSettled so a failure on one repository will never break the rest of the inbox.
 */
export async function aggregateRequests(
  repositories: ManagedRepository[],
  status: RequestStatus
): Promise<AggregateRequestsResult> {
  const errors: AggregateRequestsResult["errors"] = [];
  const allRequests: AccessRequest[] = [];

  const results = await Promise.allSettled(
    repositories.map(async (repo) => {
      if (!isGatingSupported(repo.type)) {
        return { repo, requests: [] };
      }
      const list = await fetchRepoRequests(repo, status);
      return { repo, requests: list };
    })
  );

  let successfulRepos = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const repo = repositories[i];

    if (result.status === "fulfilled") {
      successfulRepos++;
      allRequests.push(...result.value.requests);
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
  };
}

/**
 * Aggregates diagnostic status across all configured repositories with failure isolation.
 */
export async function aggregateRepositoriesStatus(
  repositories: ManagedRepository[]
): Promise<RepositoryStatus[]> {
  const results = await Promise.allSettled(
    repositories.map(async (repo) => checkRepositoryStatus(repo))
  );

  return results.map((result, idx) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    const err = result.reason;
    return {
      repository: repositories[idx],
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  });
}

/**
 * Executes bulk approve action across multiple requests with concurrency limit (e.g. 5)
 */
export async function executeBulkApprove(
  items: BulkActionItem[],
  concurrency = 5
): Promise<BulkActionResult> {
  const errors: BulkActionResult["errors"] = [];
  let succeeded = 0;

  await mapConcurrent(items, concurrency, async (item) => {
    try {
      await approveRequest(item.repo, item.username);
      succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ item, error: errorMsg });
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
 * Executes bulk reject action across multiple requests with concurrency limit (e.g. 5)
 */
export async function executeBulkReject(
  items: BulkActionItem[],
  concurrency = 5
): Promise<BulkActionResult> {
  const errors: BulkActionResult["errors"] = [];
  let succeeded = 0;

  await mapConcurrent(items, concurrency, async (item) => {
    try {
      await rejectRequest(item.repo, item.username);
      succeeded++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push({ item, error: errorMsg });
    }
  });

  return {
    total: items.length,
    succeeded,
    failed: errors.length,
    errors,
  };
}
